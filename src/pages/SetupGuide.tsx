import React from 'react';
import { Check, ArrowRight, ArrowUpRight, MessageSquare, ArrowLeft } from 'lucide-react';

export default function SetupGuide() {
  return (
    <div className="min-h-screen bg-white flex font-sans text-gray-900 selection:bg-pink-100">
      {/* Sidebar */}
      <div className="w-[260px] border-r border-gray-200 flex flex-col justify-between py-8 px-6 hidden md:flex shrink-0">
        <div>
          <div className="text-xl font-extrabold tracking-tight mb-10 flex items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 20L8 4h3l-4 16H4zm6 0l4-16h3l-4 16h-3zm6 0l4-16h3l-4 16h-3z" />
            </svg>
            mida
          </div>
          <h1 className="text-xl font-bold mb-8">Set Up Guide</h1>
          
          <div className="space-y-2">
            <div className="flex items-center gap-3 px-3 py-2.5 text-gray-400">
              <div className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center text-xs font-semibold">1</div>
              <span className="text-sm font-medium">Your Tests</span>
            </div>
            
            <div className="flex items-center gap-3 px-3 py-2.5 bg-[#f0f9f6] rounded-lg text-[#0f766e]">
              <div className="w-6 h-6 rounded-full bg-[#10b981] flex items-center justify-center text-white shrink-0">
                <Check size={14} strokeWidth={3} />
              </div>
              <span className="text-sm font-semibold">Install pixel</span>
            </div>
            
            <div className="flex items-center gap-3 px-3 py-2.5 text-gray-400">
              <div className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center text-xs font-semibold">3</div>
              <span className="text-sm font-medium">Verify</span>
            </div>
          </div>
        </div>
        
        <div className="pt-6">
          <p className="text-xs text-gray-500 mb-2">Need help?</p>
          <button className="text-sm font-semibold flex items-center gap-1 hover:text-gray-700 transition-colors">
            Visit Help Center <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto relative">
        <div className="max-w-[800px] w-full mx-auto px-8 py-10 flex-1 flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-bold tracking-widest text-gray-600 uppercase">Step 2</span>
            <button className="text-sm text-gray-500 underline decoration-gray-300 underline-offset-4 hover:text-gray-900 transition-colors">
              I'll set this up later
            </button>
          </div>
          <h2 className="text-[28px] font-bold mb-10 text-gray-900">Install the Tracking Code</h2>

          {/* Next.js Box */}
          <div className="border border-gray-200 rounded-xl p-4 flex items-center justify-between mb-12 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-black rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">N</div>
              <span className="font-semibold text-[17px]">Next.js</span>
            </div>
            <button className="text-sm text-gray-500 underline decoration-gray-300 underline-offset-4 hover:text-gray-900">
              Change platform
            </button>
          </div>

          <div className="space-y-12 flex-1">
            {/* Instruction 1 */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-[26px] h-[26px] rounded-full bg-[#1e1e24] text-white flex items-center justify-center text-xs font-bold shrink-0">1</div>
                <h3 className="font-semibold text-lg text-gray-900">Install the package</h3>
              </div>
              <div className="ml-[38px] bg-[#1e1e24] rounded-lg p-4 flex justify-between items-start text-[15px] font-mono text-gray-200 shadow-sm overflow-x-auto">
                <div className="flex flex-col gap-5 pr-4">
                  <div>
                    <div className="text-gray-500 text-sm mb-1.5"># via npm</div>
                    <div className="whitespace-nowrap text-gray-100">npm install mida-nextjs</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-sm mb-1.5"># via yarn</div>
                    <div className="whitespace-nowrap text-gray-100">yarn add mida-nextjs</div>
                  </div>
                </div>
                <button className="bg-[#303036] hover:bg-[#3d3d45] transition-colors px-4 py-1.5 rounded-md text-xs font-medium text-gray-300 border border-gray-600 shadow-sm shrink-0 mt-0.5">
                  Copy
                </button>
              </div>
            </div>

            {/* Instruction 2 */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-[26px] h-[26px] rounded-full bg-[#1e1e24] text-white flex items-center justify-center text-xs font-bold shrink-0">2</div>
                <h3 className="font-semibold text-lg text-gray-900">Add MidaScript to your app</h3>
              </div>
              <div className="ml-[38px] text-gray-600 text-[15px] flex flex-col md:flex-row gap-6 md:items-start leading-relaxed">
                <div className="flex-1">
                  Add the <strong className="text-gray-900 font-semibold">MidaScript</strong> component between{' '}
                  <code className="bg-[#fce7f3] text-[#db2777] px-1.5 py-0.5 rounded font-mono text-sm">&lt;head&gt;</code> and{' '}
                  <code className="bg-[#fce7f3] text-[#db2777] px-1.5 py-0.5 rounded font-mono text-sm">&lt;/head&gt;</code> of your document:
                </div>
                <ul className="list-disc pl-5 md:pl-0 space-y-2 flex-1 marker:text-gray-400">
                  <li><strong className="text-gray-900 font-semibold">For App Router:</strong> add it in app root layout file.</li>
                  <li><strong className="text-gray-900 font-semibold">For Page Router:</strong> add it in _document file.</li>
                </ul>
              </div>
            </div>

            {/* Instruction 3 */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-[26px] h-[26px] rounded-full bg-[#1e1e24] text-white flex items-center justify-center text-xs font-bold shrink-0">3</div>
                <h3 className="font-semibold text-lg text-gray-900">Pass your project key</h3>
              </div>
              <div className="ml-[38px] flex flex-col gap-4">
                <p className="text-[15px] text-gray-600">
                  Pass your project key as a prop to the MidaScript component.
                </p>
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-[15px] font-semibold text-gray-700">Your Project Key</span>
                  <div className="border border-pink-100 bg-[#fdf2f8] text-[#db2777] px-3 py-1.5 rounded-md font-mono text-sm shadow-sm">
                    8qb02AG1Yg7MlYnQaveNgl
                  </div>
                  <span className="text-sm text-gray-400 italic">(click to copy)</span>
                </div>
              </div>
            </div>
            
            {/* Instruction 4 */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-[26px] h-[26px] rounded-full bg-[#1e1e24] text-white flex items-center justify-center text-xs font-bold shrink-0">4</div>
                <h3 className="font-semibold text-lg text-gray-900">Verify Installation</h3>
              </div>
              <div className="ml-[38px]">
                <p className="text-[15px] text-gray-600 mb-6">
                  Verify if Mida is receiving data from your Next.js application
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  <button className="px-5 py-2.5 rounded-lg border border-gray-200 font-semibold text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors shadow-sm text-gray-800">
                    View on GitHub <ArrowUpRight size={16} className="text-gray-500" />
                  </button>
                  <button className="px-5 py-2.5 rounded-lg bg-[#111111] hover:bg-black text-white font-semibold text-sm flex items-center gap-2 transition-colors shadow-md">
                    Next: Verify Installation <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Area */}
          <div className="mt-16 pt-6 border-t border-gray-100 flex justify-between items-center text-gray-500">
            <button className="hover:text-gray-900 text-[15px] font-medium flex items-center gap-2 transition-colors">
              <ArrowLeft size={16} /> Back
            </button>
          </div>
        </div>

        {/* Chat bubble icon floating */}
        <div className="absolute bottom-8 right-8 w-[52px] h-[52px] bg-[#0073e6] rounded-full shadow-[0_8px_24px_rgba(0,115,230,0.4)] flex items-center justify-center text-white cursor-pointer hover:bg-blue-700 transition-colors z-50">
          <MessageSquare size={24} fill="currentColor" />
        </div>
      </div>
    </div>
  );
}
