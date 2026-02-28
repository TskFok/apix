import { useEffect, useRef } from 'react';
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
}: ModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

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
          <input
            ref={inputRef}
            type="text"
            className="modal-input"
            autoCapitalize="off"
            autoCorrect="off"
            defaultValue={defaultValue}
            placeholder={placeholder}
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
          />
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
