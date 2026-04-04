interface DetailPanelProps {
  children?: React.ReactNode;
}

export default function DetailPanel({ children }: DetailPanelProps) {
  return (
    <div className="flex-1 h-full overflow-y-auto">
      {children || (
        <div className="flex items-center justify-center h-full text-white/30">
          <div className="text-center">
            <p className="text-5xl mb-4">🔒</p>
            <p className="text-lg font-medium">Select a credential</p>
            <p className="text-sm mt-1">Choose an item from the list to view details</p>
          </div>
        </div>
      )}
    </div>
  );
}
