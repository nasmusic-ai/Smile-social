
import React from 'react';

interface VisualizerProps {
  isActive: boolean;
  isThinking: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ isActive, isThinking }) => {
  return (
    <div className="flex flex-col items-center justify-center p-8">
      <div className={`relative w-48 h-48 rounded-full bg-yellow-400 flex items-center justify-center shadow-2xl transition-all duration-500 ${isActive ? 'scale-110 ring-8 ring-yellow-200' : 'scale-100'}`}>
        {/* Face */}
        <div className="flex flex-col items-center gap-6">
          <div className="flex gap-8">
            <div className={`w-4 h-6 bg-gray-800 rounded-full transition-all duration-300 ${isThinking ? 'animate-bounce' : ''}`}></div>
            <div className={`w-4 h-6 bg-gray-800 rounded-full transition-all duration-300 ${isThinking ? 'animate-bounce delay-75' : ''}`}></div>
          </div>
          <div className={`w-16 h-8 border-b-4 border-gray-800 rounded-full transition-all duration-300 ${isActive ? 'h-10' : 'h-4'}`}></div>
        </div>

        {/* Pulsing rings when active */}
        {isActive && (
          <>
            <div className="absolute inset-0 rounded-full border-4 border-yellow-300 animate-ping opacity-20"></div>
            <div className="absolute inset-0 rounded-full border-8 border-yellow-200 animate-pulse opacity-10"></div>
          </>
        )}
      </div>
      <p className="mt-8 text-yellow-800 font-medium text-lg italic">
        {isActive ? (isThinking ? "Thinking..." : "Listening...") : "Tap to start smiling!"}
      </p>
    </div>
  );
};

export default Visualizer;
