import { useEffect } from 'react';
import './FileSelectModal.css';

export interface BodyFormFile {
  path: string;
  name: string;
}

interface FileSelectModalProps {
  open: boolean;
  onClose: () => void;
  files: BodyFormFile[];
  onFilesChange: (files: BodyFormFile[]) => void;
  onSelectFromLocal: () => Promise<void>;
}

export function FileSelectModal({
  open,
  onClose,
  files,
  onFilesChange,
  onSelectFromLocal,
}: FileSelectModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      document.addEventListener('keydown', onKeyDown);
      return () => document.removeEventListener('keydown', onKeyDown);
    }
  }, [open, onClose]);

  const handleRemoveFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  const handleClearAll = () => {
    onFilesChange([]);
  };

  if (!open) return null;

  return (
    <div className="file-select-overlay" onClick={onClose}>
      <div className="file-select-modal" onClick={(e) => e.stopPropagation()}>
        <div className="file-select-header">
          <span className="file-select-title">选择文件</span>
          <button
            type="button"
            className="file-select-close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <div className="file-select-body">
          <div className="file-select-input-wrap">
            {files.length > 0 ? (
              <div className="file-select-chips">
                {files.map((file, fi) => (
                  <span key={fi} className="file-select-chip">
                    <span className="file-select-chip-name" title={file.path}>{file.name}</span>
                    <button
                      type="button"
                      className="file-select-chip-remove"
                      onClick={(e) => { e.stopPropagation(); handleRemoveFile(fi); }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <span className="file-select-placeholder">未选择文件</span>
            )}
            {files.length > 0 && (
              <button
                type="button"
                className="file-select-clear"
                onClick={handleClearAll}
                title="清除全部"
              >
                ×
              </button>
            )}
          </div>
          <button
            type="button"
            className="file-select-local-btn"
            onClick={onSelectFromLocal}
          >
            <span className="file-select-plus">+</span>
            从本机选择文件
          </button>
        </div>
      </div>
    </div>
  );
}
