'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { PageHeader } from '@/components/layout/PageShell';
import { useComplex } from '@/features/complex/hooks';
import { BankDetailsForm } from './BankDetailsForm';
import { ComplexSettingsForm } from './ComplexSettingsForm';
import { PaymentQrCard } from './PaymentQrCard';

/**
 * /admin/settings: complex data and bank details (used by the public payment link).
 * Each form is mounted with a `key` built from the saved values, so after a save it remounts
 * with the new defaults instead of calling `form.reset()`.
 */
export function SettingsPage() {
  const complex = useComplex();

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Datos del complejo y datos bancarios para recibir transferencias."
      />
      {complex.isPending ? (
        <Skeleton className="h-96 max-w-2xl" />
      ) : complex.isError ? (
        <ErrorAlert error={complex.error} onRetry={() => complex.refetch()} />
      ) : (
        <div className="flex flex-col gap-6">
          <ComplexSettingsForm
            key={`${complex.data.name}|${complex.data.address}`}
            complex={complex.data}
          />
          <BankDetailsForm
            key={`${complex.data.bankCbu}|${complex.data.bankAlias}|${complex.data.bankHolderName}`}
            complex={complex.data}
          />
          <PaymentQrCard complex={complex.data} />
        </div>
      )}
    </>
  );
}
