'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageShell';
import { CustomerForm } from './CustomerForm';

/** /admin/customers/new. */
export function NewCustomerPage() {
  const router = useRouter();
  return (
    <>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/admin/customers" />}>
              Clientes
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Nuevo cliente</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader title="Nuevo cliente" />
      <Card>
        <CardContent className="pt-6">
          <CustomerForm
            onCancel={() => router.push('/admin/customers')}
            onSaved={(customer) =>
              router.push(`/admin/customers/${customer.id}`)
            }
          />
        </CardContent>
      </Card>
    </>
  );
}
