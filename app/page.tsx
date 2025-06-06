'use client';

import { useState, useRef, useCallback } from 'react';
import jsPDF from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import Swal from 'sweetalert2';
import { motion, AnimatePresence } from 'framer-motion';
import { PuffLoader } from 'react-spinners';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

type TabType = 'image-to-pdf' | 'pdf-splitter';

interface ImageFile {
  id: string;
  file: File;
  url: string;
  croppedUrl?: string;
  crop?: PixelCrop;
}

export default function PDFTools() {
  const [activeTab, setActiveTab] = useState<TabType>('image-to-pdf');
  const [images, setImages] = useState<ImageFile[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pageRanges, setPageRanges] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<ImageFile | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggedItem = useRef<number | null>(null);

  // Image to PDF functions
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newImages = Array.from(e.target.files).map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        url: URL.createObjectURL(file)
      }));
      setImages(prev => [...prev, ...newImages]);
    }
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const updated = prev.filter(img => img.id !== id);
      // Cleanup URLs
      const removed = prev.find(img => img.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.url);
        if (removed.croppedUrl) URL.revokeObjectURL(removed.croppedUrl);
      }
      return updated;
    });
  };

  const openCropModal = (image: ImageFile) => {
    setFullScreenImage(image);
    setCrop({
      unit: '%',
      width: 90,
      height: 90,
      x: 5,
      y: 5
    });
  };

  const closeCropModal = () => {
    setFullScreenImage(null);
    setCrop(undefined);
    setCompletedCrop(undefined);
  };

  const getCroppedImg = useCallback(
    (image: HTMLImageElement, crop: PixelCrop): Promise<string> => {
      const canvas = canvasRef.current;
      if (!canvas) return Promise.reject('Canvas not found');

      const ctx = canvas.getContext('2d');
      if (!ctx) return Promise.reject('Canvas context not found');

      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      canvas.width = crop.width;
      canvas.height = crop.height;

      ctx.drawImage(
        image,
        crop.x * scaleX,
        crop.y * scaleY,
        crop.width * scaleX,
        crop.height * scaleY,
        0,
        0,
        crop.width,
        crop.height
      );

      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(URL.createObjectURL(blob));
          }
        }, 'image/jpeg', 1);
      });
    },
    []
  );

  const applyCrop = async () => {
    if (!imgRef.current || !completedCrop || !fullScreenImage) return;

    try {
      const croppedImageUrl = await getCroppedImg(imgRef.current, completedCrop);
      
      setImages(prev => prev.map(img => 
        img.id === fullScreenImage.id 
          ? { 
              ...img, 
              croppedUrl: croppedImageUrl,
              crop: completedCrop 
            }
          : img
      ));
      
      closeCropModal();
      Swal.fire('Success', 'Image cropped successfully!', 'success');
    } catch (error) {
      Swal.fire('Error', 'Failed to crop image', 'error');
    }
  };

  // Drag and drop functions
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    draggedItem.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = draggedItem.current;
    
    if (dragIndex === null || dragIndex === dropIndex) return;

    setImages(prev => {
      const newImages = [...prev];
      const draggedImage = newImages[dragIndex];
      newImages.splice(dragIndex, 1);
      newImages.splice(dropIndex, 0, draggedImage);
      return newImages;
    });

    draggedItem.current = null;
  };

  const generatePDF = async () => {
    if (images.length === 0) {
      Swal.fire('No images', 'Please upload at least one image.', 'warning');
      return;
    }

    setLoading(true);

    try {
      let pdf: jsPDF | undefined = undefined;

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const imageUrl = img.croppedUrl || img.url;
        
        await new Promise<void>((resolve) => {
          const imageElement = new Image();
          imageElement.onload = function () {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = imageElement.width;
            canvas.height = imageElement.height;
            ctx?.drawImage(imageElement, 0, 0);
            
            const imageData = canvas.toDataURL('image/jpeg', 0.8);
            
            // Get image dimensions in pixels
            const imgWidth = imageElement.width;
            const imgHeight = imageElement.height;
            
            // Convert pixels to mm (assuming 72 DPI)
            const mmWidth = (imgWidth * 25.4) / 72;
            const mmHeight = (imgHeight * 25.4) / 72;
            
            if (i === 0) {
              // Initialize PDF with first image dimensions
              pdf = new jsPDF({
                orientation: mmWidth > mmHeight ? 'landscape' : 'portrait',
                unit: 'mm',
                format: [mmWidth, mmHeight]
              });
            } else if (pdf) {
              // Add a new page with the current image dimensions
              pdf.addPage([mmWidth, mmHeight]);
            }
            
            // Add image to fill the entire page
            if (pdf) {
              pdf.addImage(imageData, 'JPEG', 0, 0, mmWidth, mmHeight);
            }
            resolve();
          };
          imageElement.src = imageUrl;
        });
      }

      (pdf as unknown as jsPDF).save('converted.pdf');
      Swal.fire('Success', 'PDF downloaded successfully!', 'success');
    } catch (error) {
      Swal.fire('Error', 'Something went wrong!', 'error');
    } finally {
      setLoading(false);
    }
  };

  // PDF Splitter functions
  const handlePdfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPdfFile(e.target.files[0]);
    }
  };

  const splitPDF = async () => {
    if (!pdfFile) {
      Swal.fire('No PDF', 'Please upload a PDF file first.', 'warning');
      return;
    }

    if (!pageRanges.trim()) {
      Swal.fire('No ranges', 'Please specify page ranges to extract (e.g., 1-3,5,7-9).', 'warning');
      return;
    }

    setLoading(true);

    try {
      // Parse page ranges
      const ranges = pageRanges.split(',');
      const pagesToExtract: number[] = [];
      
      for (const range of ranges) {
        if (range.includes('-')) {
          const [start, end] = range.split('-').map(Number);
          for (let i = start; i <= end; i++) {
            if (!isNaN(i)) pagesToExtract.push(i - 1);
          }
        } else {
          const page = Number(range);
          if (!isNaN(page)) pagesToExtract.push(page - 1);
        }
      }
      
      if (pagesToExtract.length === 0) {
        Swal.fire('Invalid ranges', 'Please specify valid page ranges.', 'error');
        return;
      }

      const arrayBuffer = await pdfFile.arrayBuffer();
      const originalPdf = await PDFDocument.load(arrayBuffer);
      const newPdf = await PDFDocument.create();
      
      const copiedPages = await newPdf.copyPages(originalPdf, pagesToExtract);
      copiedPages.forEach(page => newPdf.addPage(page));
      
      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `split_${pdfFile.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      Swal.fire('Success', `PDF split successfully! Pages extracted: ${pagesToExtract.map(p => p + 1).join(', ')}`, 'success');
    } catch (error) {
      console.error('Error splitting PDF:', error);
      Swal.fire('Error', 'Failed to split PDF. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const resetFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setPdfFile(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-900 via-black to-gray-800 text-white">
      {/* Header */}
      <header className="w-full bg-black bg-opacity-30 backdrop-blur border-b border-gray-700 py-4 px-6 flex items-center justify-between shadow-sm">
        <h1 className="text-2xl font-bold text-indigo-400">Dennam.lk</h1>
        <p className="text-sm text-gray-400 hidden sm:block">Fast & free PDF tools</p>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex items-center justify-center p-6">
        <motion.div
          className="w-full max-w-4xl bg-black bg-opacity-30 backdrop-blur rounded-3xl shadow-xl p-8 border border-gray-700"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Tabs */}
          <div className="flex border-b border-gray-700 mb-6">
            <button
              onClick={() => setActiveTab('image-to-pdf')}
              className={`px-4 py-2 font-medium ${activeTab === 'image-to-pdf' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white'}`}
            >
              Image to PDF
            </button>
            <button
              onClick={() => setActiveTab('pdf-splitter')}
              className={`px-4 py-2 font-medium ${activeTab === 'pdf-splitter' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white'}`}
            >
              PDF Splitter
            </button>
          </div>

          {activeTab === 'image-to-pdf' ? (
            <>
              <h2 className="text-3xl font-bold text-center text-indigo-300 mb-6">
                🖼️ Image to PDF Converter
              </h2>

              <label
                htmlFor="file-upload"
                className="w-full h-36 border-2 border-dashed border-indigo-500 bg-gray-900 bg-opacity-60 text-indigo-300 flex flex-col items-center justify-center rounded-xl cursor-pointer hover:bg-gray-800 transition"
              >
                <span className="text-sm font-medium">Click or drag to upload image(s)</span>
                <input
                  id="file-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImageFileChange}
                />
              </label>

              {images.length > 0 && (
                <>
                  <h3 className="text-xl font-semibold mt-8 mb-4 text-indigo-300">
                    Preview & Edit (Drag to reorder)
                  </h3>
                  <motion.div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6"
                    initial="hidden"
                    animate="visible"
                    variants={{
                      hidden: {},
                      visible: {
                        transition: {
                          staggerChildren: 0.1,
                        },
                      },
                    }}
                  >
                    {images.map((img, idx) => (
                      <div
                        key={img.id}
                        className="relative overflow-hidden rounded-lg border border-gray-600 shadow cursor-move bg-gray-800 hover:scale-105 transition-transform"
                        draggable
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, idx)}
                      >
                        <div className="relative">
                          <img
                            src={img.croppedUrl || img.url}
                            alt={`Preview ${idx}`}
                            className="w-full h-40 object-cover"
                          />
                          <div className="absolute top-2 right-2 flex gap-1">
                            <button
                              onClick={() => openCropModal(img)}
                              className="bg-blue-600 hover:bg-blue-700 text-white p-1 rounded text-xs"
                              title="Crop image"
                            >
                              ✂️
                            </button>
                            <button
                              onClick={() => removeImage(img.id)}
                              className="bg-red-600 hover:bg-red-700 text-white p-1 rounded text-xs"
                              title="Remove image"
                            >
                              ❌
                            </button>
                          </div>
                          <div className="absolute bottom-2 left-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded">
                            {idx + 1}
                          </div>
                          {img.croppedUrl && (
                            <div className="absolute top-2 left-2 bg-green-600 text-white text-xs px-2 py-1 rounded">
                              Cropped
                            </div>
                          )}
                        </div>
                        <div className="p-2">
                          <p className="text-xs text-gray-300 truncate">{img.file.name}</p>
                        </div>
                      </div>
                    ))}
                  </motion.div>

                  <div className="flex justify-center">
                    <button
                      onClick={generatePDF}
                      className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-semibold text-lg transition disabled:opacity-50"
                      disabled={loading}
                    >
                      {loading ? (
                        <div className="flex items-center gap-2">
                          <PuffLoader size={24} color="#fff" /> Processing...
                        </div>
                      ) : (
                        '📄 Download PDF'
                      )}
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold text-center text-indigo-300 mb-6">
                ✂️ PDF Splitter
              </h2>

              <div className="space-y-6">
                <div>
                  <label
                    htmlFor="pdf-upload"
                    className="w-full h-36 border-2 border-dashed border-indigo-500 bg-gray-900 bg-opacity-60 text-indigo-300 flex flex-col items-center justify-center rounded-xl cursor-pointer hover:bg-gray-800 transition"
                  >
                    {pdfFile ? (
                      <div className="text-center p-4">
                        <p className="font-medium">{pdfFile.name}</p>
                        <p className="text-sm text-gray-400 mt-2">
                          {(pdfFile.size / 1024).toFixed(2)} KB
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            resetFileInput();
                          }}
                          className="mt-2 text-red-400 hover:text-red-300 text-sm"
                        >
                          Remove file
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm font-medium">Click to upload PDF</span>
                        <input
                          id="pdf-upload"
                          type="file"
                          accept=".pdf"
                          ref={fileInputRef}
                          className="hidden"
                          onChange={handlePdfFileChange}
                        />
                      </>
                    )}
                  </label>
                </div>

                <div>
                  <label htmlFor="page-ranges" className="block text-sm font-medium text-indigo-300 mb-2">
                    Page ranges to extract (e.g., 1-3,5,7-9)
                  </label>
                  <input
                    id="page-ranges"
                    type="text"
                    value={pageRanges}
                    onChange={(e) => setPageRanges(e.target.value)}
                    placeholder="1-3,5,7-9"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Specify which pages to extract. Separate multiple ranges with commas.
                  </p>
                </div>

                <div className="flex justify-center">
                  <button
                    onClick={splitPDF}
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-semibold text-lg transition disabled:opacity-50"
                    disabled={loading || !pdfFile || !pageRanges.trim()}
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <PuffLoader size={24} color="#fff" /> Processing...
                      </div>
                    ) : (
                      '✂️ Split PDF'
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </main>

      {/* Fullscreen Crop Modal */}
      <AnimatePresence>
        {fullScreenImage && (
          <motion.div
            className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-gray-900 rounded-lg p-6 max-w-4xl max-h-full overflow-auto"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white">Crop Image</h3>
                <button
                  onClick={closeCropModal}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ✕
                </button>
              </div>
              
              <div className="max-w-full max-h-96 overflow-auto">
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={undefined}
                >
                  <img
                    ref={imgRef}
                    src={fullScreenImage.url}
                    alt="Crop preview"
                    className="max-w-full max-h-96 object-contain"
                  />
                </ReactCrop>
              </div>
              
              <div className="flex gap-4 mt-4 justify-center">
                <button
                  onClick={applyCrop}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
                  disabled={!completedCrop}
                >
                  Apply Crop
                </button>
                <button
                  onClick={closeCropModal}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Hidden canvas for cropping */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Footer */}
      <footer className="bg-black bg-opacity-30 border-t border-gray-700 text-center py-4 text-sm text-gray-400 backdrop-blur shadow-inner">
        © {new Date().getFullYear()} Dennam.lk. Developed by Chalana Prabhashwara.
      </footer>
    </div>
  );
}