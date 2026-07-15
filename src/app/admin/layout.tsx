export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black p-4 sm:p-6 md:p-8">{children}</div>
  );
}
