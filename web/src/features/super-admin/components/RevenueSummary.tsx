import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPrice } from '@/lib/date';
import type { SuperAdminRevenue } from '@/types/admin';

/** Month totals: comprobantes (transferencias aprobadas) vs efectivo. */
export function RevenueSummary({
  totals,
}: {
  totals: SuperAdminRevenue['totals'];
}) {
  const items = [
    { label: 'Comprobantes', value: formatPrice(totals.transferTotal) },
    { label: 'Efectivo', value: formatPrice(totals.cashTotal) },
    { label: 'Total cobrado', value: formatPrice(totals.paidTotal) },
    { label: 'Turnos', value: String(totals.bookingsCount) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              {item.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {item.value}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
