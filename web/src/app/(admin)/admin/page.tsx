'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useMe } from '@/features/auth/hooks';

/** /admin: ADMIN va a la agenda, SUPER_ADMIN al listado de complejos. AdminGate ya resolvió el rol. */
export default function AdminIndexPage() {
  const me = useMe();
  const router = useRouter();
  const role = me.data?.role;

  useEffect(() => {
    if (!role) return;
    router.replace(
      role === 'SUPER_ADMIN' ? '/admin/complexes' : '/admin/agenda',
    );
  }, [role, router]);

  return null;
}
