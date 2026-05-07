'use client'
import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const saved = localStorage.getItem('myclinica-theme') as Theme | null
    const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    const initial = saved ?? preferred
    setTheme(initial)
    document.documentElement.setAttribute('data-theme', initial)
  }, [])

  function toggle() {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light'
      localStorage.setItem('myclinica-theme', next)
      document.documentElement.setAttribute('data-theme', next)
      return next
    })
  }

  return { theme, toggle }
}
