'use client';

import { Loader2Icon, TrashIcon, UploadIcon } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';
import { ComplexMark } from '@/components/layout/ComplexMark';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { errorMessage } from '@/lib/api/errors';
import type { Complex } from '@/types';
import { useDeleteComplexLogo, useUploadComplexLogo } from '../hooks';

/** Mirrors the API limit (`MAX_LOGO_BYTES`); the server stays the source of truth. */
const MAX_LOGO_MB = 2;
const ACCEPT = 'image/png,image/jpeg,image/webp';

/** Logo of the complex: shown in the admin sidebar and in the header of the public pages. */
export function ComplexLogoCard({ complex }: { complex: Complex }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadComplexLogo();
  const remove = useDeleteComplexLogo();
  const busy = upload.isPending || remove.isPending;

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_LOGO_MB * 1024 * 1024) {
      toast.error(`El logo no puede superar ${MAX_LOGO_MB} MB.`);
      return;
    }
    upload.mutate(file, {
      onSuccess: () => toast.success('Logo actualizado'),
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Logo del complejo</CardTitle>
        <CardDescription>
          Se muestra en el panel y en la página pública de reservas. PNG, JPG o
          WebP, hasta {MAX_LOGO_MB} MB.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <ComplexMark
          logoUrl={complex.logoUrl}
          fluid
          className="h-16 max-w-40 rounded-lg border p-1"
          fallback={
            <div className="text-muted-foreground flex h-16 w-24 items-center justify-center rounded-lg border border-dashed text-xs">
              Sin logo
            </div>
          }
        />
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-label="Elegir logo"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {upload.isPending ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <UploadIcon />
            )}
            {complex.logoUrl ? 'Cambiar logo' : 'Subir logo'}
          </Button>
          {complex.logoUrl && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => toast.success('Logo eliminado'),
                  onError: (error) => toast.error(errorMessage(error)),
                })
              }
            >
              {remove.isPending ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <TrashIcon />
              )}
              Quitar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
