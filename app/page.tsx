'use client';

import { useState, useRef } from 'react';
import jsPDF from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import Swal from 'sweetalert2';
import { motion } from 'framer-motion';
import { PuffLoader } from 'react-spinners';

type TabType = 'image-to-pdf' | 'pdf-splitter';

export default function PDFTools() {
  const [activeTab, setActiveTab] = useState<TabType>('image-to-pdf');
  const [images, setImages] = useState<File[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pageRanges, setPageRanges] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Image to PDF functions
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setImages(Array.from(e.target.files));
    }
  };

  const generatePDF = async () => {
    if (images.length === 0) {
      Swal.fire('No images', 'Please upload at least one image.', 'warning');
      return;
    }

    setLoading(true);

    try {
      const pdf = new jsPDF();
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const reader = new FileReader();

        await new Promise<void>((resolve) => {
          reader.onload = function (event) {
            const imageData = event.target?.result;
            if (typeof imageData === 'string') {
              const imgProps = pdf.getImageProperties(imageData);
              const pdfWidth = pdf.internal.pageSize.getWidth();
              const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
              if (i !== 0) pdf.addPage();
              pdf.addImage(imageData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            }
            resolve();
          };
          reader.readAsDataURL(img);
        });
      }

      pdf.save('converted.pdf');
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
            if (!isNaN(i)) pagesToExtract.push(i - 1); // pdf-lib uses zero-based indexing
          }
        } else {
          const page = Number(range);
          if (!isNaN(page)) pagesToExtract.push(page - 1); // pdf-lib uses zero-based indexing
        }
      }
      
      if (pagesToExtract.length === 0) {
        Swal.fire('Invalid ranges', 'Please specify valid page ranges.', 'error');
        return;
      }

      // Read the uploaded PDF file
      const arrayBuffer = await pdfFile.arrayBuffer();
      const originalPdf = await PDFDocument.load(arrayBuffer);
      
      // Create a new PDF
      const newPdf = await PDFDocument.create();
      
      // Copy the specified pages
      const copiedPages = await newPdf.copyPages(originalPdf, pagesToExtract);
      copiedPages.forEach(page => newPdf.addPage(page));
      
      // Save the new PDF
      const pdfBytes = await newPdf.save();
      
      // Create a Blob and download it
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
          className="w-full max-w-3xl bg-black bg-opacity-30 backdrop-blur rounded-3xl shadow-xl p-8 border border-gray-700"
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
                  <h3 className="text-xl font-semibold mt-8 mb-4 text-indigo-300">Preview</h3>
                  <motion.div
                    className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6"
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
                      <motion.div
                        key={idx}
                        className="overflow-hidden rounded-lg border border-gray-600 shadow"
                        whileHover={{ scale: 1.05 }}
                        transition={{ type: 'spring', stiffness: 300 }}
                      >
                        <img
                          src={URL.createObjectURL(img)}
                          alt={`Preview ${idx}`}
                          className="w-full h-40 object-cover"
                        />
                      </motion.div>
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

      {/* Footer */}
      <footer className="bg-black bg-opacity-30 border-t border-gray-700 text-center py-4 text-sm text-gray-400 backdrop-blur shadow-inner">
        &copy; {new Date().getFullYear()} Dennam.lk. Crafted with ♥ in dark mode.
      </footer>
    </div>
  );
}