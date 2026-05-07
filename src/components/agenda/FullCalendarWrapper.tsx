'use client'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import googleCalendarPlugin from '@fullcalendar/google-calendar'
import type { EventClickArg, DateSelectArg } from '@fullcalendar/core'
import './fullcalendar.css'

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end?: string
  color: string
  extendedProps: Record<string, unknown>
}

interface Props {
  events: CalendarEvent[]
  googleCalendarId?: string
  onEventClick: (id: string) => void
  onDateSelect: (dateStr: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  agendado:  '#3B82F6',
  confirmado:'#10B981',
  concluido: '#6B7280',
  cancelado: '#EF4444',
  faltou:    '#F59E0B',
}

export function statusColor(status: string) {
  return STATUS_COLORS[status] ?? '#3B82F6'
}

export default function FullCalendarWrapper({ events, googleCalendarId, onEventClick, onDateSelect }: Props) {
  const GAPI_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY

  const eventSources = [
    { events },
    ...(googleCalendarId && GAPI_KEY
      ? [{ googleCalendarId, className: 'gcal-event' }]
      : []),
  ]

  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, googleCalendarPlugin]}
      initialView="dayGridMonth"
      locale="pt-br"
      headerToolbar={{
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay',
      }}
      buttonText={{ today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia' }}
      googleCalendarApiKey={GAPI_KEY}
      eventSources={eventSources}
      selectable
      selectMirror
      select={(arg: DateSelectArg) => onDateSelect(arg.startStr)}
      eventClick={(arg: EventClickArg) => {
        arg.jsEvent.preventDefault()
        const id = arg.event.id
        if (id) onEventClick(id)
      }}
      height="auto"
      eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
    />
  )
}
