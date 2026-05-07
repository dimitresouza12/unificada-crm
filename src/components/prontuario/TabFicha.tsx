'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Patient, MedicalRecord, RecordEntry } from '@/types'
import type { AuthClinic } from '@/types'
import { printProntuario, printContrato } from '@/lib/print'
import styles from './TabFicha.module.css'

interface Props {
  patient: Patient
  record: MedicalRecord | null
  entries: RecordEntry[]
  clinic: AuthClinic
  clinicId: string
  clinicName: string
  onSaved: () => void
}

const CONTRACT_TEMPLATE = (clinic: string, patient: string) => `CONTRATO DE PRESTAÇÃO DE SERVIÇOS ODONTOLÓGICOS

CONTRATADA: ${clinic}
CONTRATANTE: ${patient}

CLÁUSULA 1ª: O presente contrato tem por objeto a prestação de serviços odontológicos conforme plano de tratamento anexo.
CLÁUSULA 2ª: O CONTRATANTE compromete-se a comparecer nas datas e horários agendados.
CLÁUSULA 3ª: Em caso de desistência, o CONTRATANTE deverá comunicar com antecedência mínima de 24 horas.

Assinatura: __________________________________
Data: ${new Date().toLocaleDateString('pt-BR')}`

export function TabFicha({ patient, record, entries, clinic, clinicId, clinicName, onSaved }: Props) {
  const [anamnesis, setAnamnesis] = useState<Record<string, string>>({})
  const [clinicalExam, setClinicalExam] = useState<Record<string, string>>({})
  const [treatmentPlan, setTreatmentPlan] = useState('')
  const [contractText, setContractText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (record) {
      setAnamnesis(record.anamnesis ?? {})
      setClinicalExam(record.clinical_exam ?? {})
      setTreatmentPlan(record.treatment_plan ?? '')
      setContractText(record.contract_text ?? CONTRACT_TEMPLATE(clinicName, patient.name))
    } else {
      setContractText(CONTRACT_TEMPLATE(clinicName, patient.name))
    }
  }, [record, clinicName, patient.name])

  function setA(k: string, v: string) { setAnamnesis((p) => ({ ...p, [k]: v })) }
  function setE(k: string, v: string) { setClinicalExam((p) => ({ ...p, [k]: v })) }

  async function handleSave() {
    setSaving(true)
    try {
      const payload = {
        clinic_id: clinicId,
        patient_id: patient.id,
        anamnesis,
        clinical_exam: clinicalExam,
        treatment_plan: treatmentPlan,
        contract_text: contractText,
        updated_at: new Date().toISOString(),
      }
      if (record?.id) {
        await supabase.from('medical_records').update(payload).eq('id', record.id)
      } else {
        await supabase.from('medical_records').insert([payload])
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const clinicInfo = {
    name: clinic.name,
    logo: clinic.logo || undefined,
    address: clinic.address || undefined,
    phone: clinic.phone || undefined,
  }

  const recordForPrint: MedicalRecord = {
    ...(record ?? {} as MedicalRecord),
    anamnesis,
    clinical_exam: clinicalExam,
    treatment_plan: treatmentPlan,
    contract_text: contractText,
  }

  const aField = (k: string, label: string) => (
    <div className={styles.field} key={k}>
      <label>{label}</label>
      <textarea rows={2} value={anamnesis[k] ?? ''} onChange={(e) => setA(k, e.target.value)} />
    </div>
  )
  const eField = (k: string, label: string) => (
    <div className={styles.field} key={k}>
      <label>{label}</label>
      <textarea rows={2} value={clinicalExam[k] ?? ''} onChange={(e) => setE(k, e.target.value)} />
    </div>
  )

  return (
    <div className={styles.wrap}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Identificação</h3>
        <div className={styles.grid2}>
          {[
            ['p-cpf','CPF'], ['p-rg','RG'], ['p-nasc','Data de Nascimento'],
            ['p-genero','Gênero'], ['p-ocupacao','Ocupação'], ['p-endereco','Endereço'],
            ['p-indicado','Como nos conheceu'], ['p-emergencia','Contato de Emergência'],
          ].map(([k,l]) => (
            <div className={styles.field} key={k}>
              <label>{l}</label>
              <input value={anamnesis[k] ?? ''} onChange={(e) => setA(k, e.target.value)} />
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Anamnese</h3>
        <div className={styles.grid2}>
          {aField('a-saude', 'Estado geral de saúde')}
          {aField('a-tratamento', 'Em tratamento médico? Qual?')}
          {aField('a-medicamentos', 'Medicamentos em uso')}
          {aField('a-alergia', 'Alergias')}
          {aField('a-pressao', 'Pressão arterial')}
          {aField('a-fumante', 'Fumante / Álcool')}
          {aField('a-gengiva', 'Sangramento gengival')}
          {aField('a-habitos', 'Hábitos bucais')}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Exame Clínico</h3>
        <div className={styles.grid2}>
          {eField('e-higiene', 'Higiene bucal')}
          {eField('e-halitose', 'Halitose')}
          {eField('e-mucosa', 'Mucosa')}
          {eField('e-palato', 'Palato')}
          {eField('e-obs', 'Observações gerais')}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Plano de Tratamento</h3>
        <textarea
          className={styles.bigArea}
          rows={5}
          value={treatmentPlan}
          onChange={(e) => setTreatmentPlan(e.target.value)}
          placeholder="Descreva o plano de tratamento..."
        />
      </section>

      <section className={styles.section}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 className={styles.sectionTitle} style={{ border: 'none', marginBottom: 0 }}>Contrato</h3>
          <button
            className={styles.btnPrint}
            onClick={() => printContrato(clinicInfo, patient, contractText)}
            type="button"
          >
            🖨️ Imprimir Contrato
          </button>
        </div>
        <textarea
          className={styles.bigArea}
          rows={10}
          value={contractText}
          onChange={(e) => setContractText(e.target.value)}
        />
      </section>

      <div className={styles.saveRow}>
        {saved && <span className={styles.savedMsg}>✓ Salvo com sucesso!</span>}
        <button
          className={styles.btnPrint}
          onClick={() => printProntuario(clinicInfo, patient, recordForPrint, entries)}
          type="button"
        >
          🖨️ Imprimir Prontuário
        </button>
        <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar Ficha'}
        </button>
      </div>
    </div>
  )
}
