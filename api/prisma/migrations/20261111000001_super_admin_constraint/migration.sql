-- A SUPER_ADMIN operates the whole platform, so it must not belong to a complex.
ALTER TABLE "users" ADD CONSTRAINT "users_super_admin_no_complex_chk" CHECK ("role" <> 'SUPER_ADMIN' OR "complex_id" IS NULL);
