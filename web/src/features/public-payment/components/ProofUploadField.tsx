'use client';

import {
  CheckCircle2Icon,
  FileImageIcon,
  FileTextIcon,
  RefreshCwIcon,
  UploadIcon,
  XIcon,
} from 'lucide-react';
import type { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatFileSize } from '../schemas';

/** Receipt picker: dashed drop zone, or a success card once a valid file is attached. */
export function ProofUploadField({
  inputRef,
  file,
  error,
  disabled,
  onChoose,
  onClear,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  file: File | null;
  error: string | null;
  disabled: boolean;
  onChoose: (file: File | undefined) => void;
  onClear: () => void;
}) {
  const errorId = 'payment-proof-error';
  const isPdf =
    file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name ?? '');
  const TypeIcon = isPdf ? FileTextIcon : FileImageIcon;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm leading-snug font-medium">Comprobante</span>
      <input
        ref={inputRef}
        id="payment-proof-file"
        data-testid="payment-proof-input"
        type="file"
        accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
        className="sr-only"
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChoose(event.target.files?.[0])}
      />
      {file ? (
        <div className="border-success/40 bg-success-subtle flex items-center gap-3 rounded-xl border p-3 text-sm">
          <TypeIcon
            className="text-success-subtle-foreground size-6 shrink-0"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 font-medium">
              <span className="min-w-0 truncate">{file.name}</span>
              <CheckCircle2Icon
                className="text-success size-4 shrink-0"
                aria-label="Comprobante adjunto"
              />
            </p>
            <p className="text-muted-foreground text-xs tabular-nums">
              {formatFileSize(file.size)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Reemplazar archivo"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <RefreshCwIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Quitar archivo"
            disabled={disabled}
            onClick={onClear}
          >
            <XIcon />
          </Button>
        </div>
      ) : (
        <label
          htmlFor="payment-proof-file"
          className={cn(
            'bg-primary/5 hover:bg-primary/10 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors',
            error && 'border-destructive',
            disabled && 'pointer-events-none opacity-50',
          )}
        >
          <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
            <UploadIcon className="size-6" aria-hidden />
          </span>
          <span className="text-sm font-semibold">Adjuntar comprobante</span>
          <span className="text-muted-foreground text-xs">
            PDF, JPG o PNG · máx. 5 MB
          </span>
        </label>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
