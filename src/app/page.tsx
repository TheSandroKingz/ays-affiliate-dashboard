import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const { data: stats, error } = await supabaseAdmin
    .from('affiliate_stats')
    .select(`
      id,
      affiliate_id,
      stat_date,
      clicks_total,
      leads_total,
      deposits_total,
      commission_total,
      affiliates ( display_name )
    `)
    .order('stat_date', { ascending: false })

  if (error) {
    return (
      <main style={{ padding: 32 }}>
        <h1>Dashboard de Afiliados</h1>
        <p style={{ color: 'red' }}>Error: {error.message}</p>
      </main>
    )
  }

  return (
    <main style={{ padding: 32 }}>
      <h1>Dashboard de Afiliados</h1>
      {(!stats || stats.length === 0) ? (
        <p>Todavía no hay estadísticas cargadas.</p>
      ) : (
        <table border={1} cellPadding={8}>
          <thead>
            <tr>
              <th>Afiliado</th>
              <th>Fecha</th>
              <th>Clicks</th>
              <th>Leads</th>
              <th>Depósitos</th>
              <th>Comisión</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((row: any) => (
              <tr key={row.id}>
                <td>{row.affiliates?.display_name ?? '—'}</td>
                <td>{row.stat_date}</td>
                <td>{row.clicks_total}</td>
                <td>{row.leads_total}</td>
                <td>{row.deposits_total}</td>
                <td>{row.commission_total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
