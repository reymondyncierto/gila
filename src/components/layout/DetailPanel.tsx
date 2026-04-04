interface DetailPanelProps {
  children?: React.ReactNode;
}

export default function DetailPanel({ children }: DetailPanelProps) {
  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50">
      {children || (
        <div className="flex items-center justify-center h-full text-slate-400">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-sky-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-sky-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-base font-medium text-slate-500">Select a credential</p>
            <p className="text-sm mt-1 text-slate-400">Choose an item from the list to view details</p>
          </div>
        </div>
      )}
    </div>
  );
}
