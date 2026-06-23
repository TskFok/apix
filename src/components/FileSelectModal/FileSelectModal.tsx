import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { FastTooltip } from '../FastTooltip/FastTooltip';
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
  useEscapeToClose(open, onClose);

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
                    <FastTooltip label={file.path}>
                      <span className="file-select-chip-name">{file.name}</span>
                    </FastTooltip>
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
              <FastTooltip label="清除全部">
                <button type="button" className="file-select-clear" onClick={handleClearAll}>
                  ×
                </button>
              </FastTooltip>
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
