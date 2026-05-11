import { supabase } from '@/lib/supabase'
import { createN8nClient } from '@/lib/supabase-n8n'

function parseN8nDate(raw: string): string | null {
  const iso = new Date(raw)
  if (!isNaN(iso.getTime())) return iso.toISOString()
  // DD/MM/YYYY HH:mm or DD/MM/YYYY
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/)
  if (m) {
    const date = new Date(+m[3], +m[2] - 1, +m[1], m[4] ? +m[4] : 9, m[5] ? +m[5] : 0)
    if (!isNaN(date.getTime())) return date.toISOString()
  }
  return null
}

export async function syncLeadAppointments(clinicId: string) {
  const n8n = createN8nClient()
  const { data: leads } = await n8n
    .from('chats')
    .select('phone, procedimento, data_agendamento')
    .eq('status', 'Agendado')
    .not('data_agendamento', 'is', null)

  if (!leads?.length) return

  const { data: patients } = await supabase
    .from('patients')
    .select('id, phone')
    .eq('clinic_id', clinicId)

  if (!patients?.length) return

  // Index patients by last 11 digits of phone (handles country code variants)
  const phoneMap = new Map<string, string>()
  for (const p of patients) {
    const d = String(p.phone ?? '').replace(/\D/g, '')
    if (d) phoneMap.set(d.slice(-11), p.id)
  }

  for (const lead of leads) {
    const key = lead.phone.replace(/\D/g, '').slice(-11)
    const patientId = phoneMap.get(key)
    if (!patientId) continue

    const scheduledAt = parseN8nDate(lead.data_agendamento)
    if (!scheduledAt) continue

    const datePrefix = scheduledAt.slice(0, 10)
    const { data: existing } = await supabase
      .from('appointments')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('patient_id', patientId)
      .gte('scheduled_at', `${datePrefix}T00:00:00`)
      .lte('scheduled_at', `${datePrefix}T23:59:59`)
      .limit(1)

    if (existing?.length) continue

    await supabase.from('appointments').insert([{
      clinic_id: clinicId,
      patient_id: patientId,
      procedure_name: lead.procedimento ?? 'Consulta via WhatsApp',
      scheduled_at: scheduledAt,
      duration_minutes: 60,
      status: 'agendado',
      notes: 'Agendado pelo bot WhatsApp',
    }])
  }
}
