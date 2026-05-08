'use client'
import styles from './TopBar.module.css'
import type { AuthClinic } from '@/types'
import { Icon } from '@/components/ui/Icon'

interface Props {
  clinic: AuthClinic
  onMenuToggle: () => void
}

export function TopBar({ clinic, onMenuToggle }: Props) {
  return (
    <header className={styles.bar}>
      <button className={styles.menuBtn} onClick={onMenuToggle} aria-label="Menu">
        <Icon name="menu" size={20} />
      </button>
      <div className={styles.right}>
        {clinic.logo && (
          <img src={clinic.logo} alt={clinic.name} className={styles.logo} />
        )}
        <span className={styles.clinicName}>{clinic.name}</span>
      </div>
    </header>
  )
}
