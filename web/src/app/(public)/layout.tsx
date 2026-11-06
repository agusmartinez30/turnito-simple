/** Layout sin auth: contenedor a pantalla completa. Cada página define su propia composición. */
export default function PublicLayout({ children }: LayoutProps<'/'>) {
  return <div className="flex flex-1 flex-col">{children}</div>;
}
