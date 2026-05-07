export function formatDate(dateString: string | null | undefined, short = false): string {
  if (!dateString) return '-'
  const date = new Date(dateString)
  if (short) {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    }).format(date)
  }
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(date)
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '-'
  let str = String(phone)
  if (str.includes('@')) str = str.split('@')[0]
  const digits = str.replace(/\D/g, '')
  if (digits.length >= 12 && digits.startsWith('55')) {
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9, 13)}`
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return digits || '-'
}

export function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0)
}

export function getStatusClass(status: string | null | undefined): string {
  if (!status) return 'status-pendente'
  const s = String(status).toLowerCase().trim()
  if (s.includes('agendado') || s.includes('confirmado')) return 'status-agendado'
  if (s.includes('concluído') || s.includes('concluido') || s.includes('finalizado')) return 'status-concluido'
  if (s.includes('cancelado') || s.includes('pausado')) return 'status-cancelado'
  return 'status-pendente'
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}
