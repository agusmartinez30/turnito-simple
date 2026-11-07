'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { PageHeader } from '@/components/layout/PageShell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useComplex } from '@/features/complex/hooks';
import { BankDetailsForm } from './BankDetailsForm';
import { ComplexSettingsForm } from './ComplexSettingsForm';
import { PaymentQrCard } from './PaymentQrCard';

/** Active tab: dark background with light text (also overrides the dark-mode active styles). */
const TAB_ACTIVE =
  'data-active:bg-foreground data-active:text-background dark:data-active:bg-foreground dark:data-active:text-background dark:data-active:border-transparent';

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
        title="Mi complejo"
        description="Datos del complejo, datos bancarios y QR de pago."
      />
      {complex.isPending ? (
        <Skeleton className="h-96 max-w-2xl" />
      ) : complex.isError ? (
        <ErrorAlert error={complex.error} onRetry={() => complex.refetch()} />
      ) : (
        <Tabs defaultValue="complex" className="gap-6">
          <TabsList>
            <TabsTrigger value="complex" className={TAB_ACTIVE}>
              Datos del complejo
            </TabsTrigger>
            <TabsTrigger value="bank" className={TAB_ACTIVE}>
              Datos bancarios
            </TabsTrigger>
            <TabsTrigger value="qr" className={TAB_ACTIVE}>
              QR de pago
            </TabsTrigger>
          </TabsList>
          <TabsContent value="complex">
            <ComplexSettingsForm
              key={`${complex.data.name}|${complex.data.address}`}
              complex={complex.data}
            />
          </TabsContent>
          <TabsContent value="bank">
            <BankDetailsForm
              key={`${complex.data.bankCbu}|${complex.data.bankAlias}|${complex.data.bankHolderName}`}
              complex={complex.data}
            />
          </TabsContent>
          <TabsContent value="qr">
            <PaymentQrCard complex={complex.data} />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
