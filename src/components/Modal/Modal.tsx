import { useEffect, useRef } from 'react';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import './Modal.css';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onConfirm?: (value: string) => void;
  confirmLabel?: string;
  cancelLabel?: string;
  defaultValue?: string;
  placeholder?: string;
  multiline?: boolean;
}

export function Modal({
  open,
  title,
  onClose,
  onConfirm,
  confirmLabel = '确定',
  cancelLabel = '取消',
  defaultValue = '',
  placeholder,
  multiline = false,
}: ModalProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const setInputRef = (element: HTMLInputElement | HTMLTextAreaElement | null) => {
    inputRef.current = element;
  };

  useEscapeToClose(open, onClose);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = inputRef.current?.value.trim() ?? '';
    onConfirm?.(value);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <h3 className="modal-title">{title}</h3>
          {multiline ? (
            <textarea
              ref={setInputRef}
              className="modal-input"
              autoCapitalize="off"
              autoCorrect="off"
              defaultValue={defaultValue}
              placeholder={placeholder}
              rows={8}
            />
          ) : (
            <input
              ref={setInputRef}
              type="text"
              className="modal-input"
              autoCapitalize="off"
              autoCorrect="off"
              defaultValue={defaultValue}
              placeholder={placeholder}
            />
          )}
          <div className="modal-actions">
            <button type="button" className="modal-btn modal-btn-cancel" onClick={onClose}>
              {cancelLabel}
            </button>
            <button type="submit" className="modal-btn modal-btn-confirm">
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
