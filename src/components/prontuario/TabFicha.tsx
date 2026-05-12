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

  const anamnesisFields: Record<string, [string, string][]> = {
    odonto: [
      ['a-saude', 'Estado geral de saúde'],
      ['a-tratamento', 'Em tratamento médico? Qual?'],
      ['a-medicamentos', 'Medicamentos em uso'],
      ['a-alergia', 'Alergias'],
      ['a-pressao', 'Pressão arterial'],
      ['a-fumante', 'Fumante / Álcool'],
      ['a-gengiva', 'Sangramento gengival'],
      ['a-habitos', 'Hábitos bucais'],
    ],
    medico: [
      ['a-motivo', 'Motivo da consulta (Queixa principal)'],
      ['a-hist_familiar', 'Histórico familiar'],
      ['a-comorbidades', 'Comorbidades'],
      ['a-cirurgias', 'Cirurgias anteriores'],
      ['a-medicamentos', 'Medicamentos em uso'],
      ['a-alergia', 'Alergias'],
      ['a-habitos', 'Hábitos de vida (Fumo/Álcool/Ativ. Física)'],
    ],
    estetica: [
      ['a-queixa', 'Queixa principal'],
      ['a-trat_anteriores', 'Tratamentos estéticos anteriores'],
      ['a-cosmeticos', 'Uso de cosméticos / Ácidos'],
      ['a-exposicao_solar', 'Exposição solar (Usa protetor?)'],
      ['a-alergia', 'Alergias (A cosméticos ou outros)'],
      ['a-queloides', 'Histórico de queloides'],
      ['a-cicatrizes', 'Cicatrizes recentes?'],
      ['a-gestante', 'Gestante / Lactante?'],
    ],
    vet: [
      ['a-queixa', 'Motivo da consulta / Queixa'],
      ['a-alimentacao', 'Alimentação / Dieta'],
      ['a-ambiente', 'Ambiente onde vive'],
      ['a-hist_doencas', 'Histórico de doenças / Cirurgias'],
      ['a-vacinas', 'Vacinação e Vermifugação em dia?'],
      ['a-medicamentos', 'Medicamentos em uso'],
      ['a-alergia', 'Alergias conhecidas'],
    ]
  }

  const clinicalExamFields: Record<string, [string, string][]> = {
    odonto: [
      ['e-higiene', 'Higiene bucal'],
      ['e-halitose', 'Halitose'],
      ['e-mucosa', 'Mucosa'],
      ['e-palato', 'Palato'],
      ['e-obs', 'Observações gerais'],
    ],
    medico: [
      ['e-pressao', 'Pressão Arterial'],
      ['e-fc', 'Frequência Cardíaca'],
      ['e-antropometria', 'Peso / Altura / IMC'],
      ['e-ausculta', 'Ausculta Cardíaca / Pulmonar'],
      ['e-exame_fisico', 'Exame Físico Específico'],
      ['e-obs', 'Observações gerais'],
    ],
    estetica: [
      ['e-tipo_pele', 'Tipo de pele'],
      ['e-fototipo', 'Fototipo'],
      ['e-hidratacao', 'Grau de hidratação'],
      ['e-lesoes', 'Lesões visíveis / Flacidez / Celulite'],
      ['e-obs', 'Observações gerais'],
    ],
    vet: [
      ['e-temperatura', 'Temperatura'],
      ['e-mucosas', 'Mucosas'],
      ['e-hidratacao', 'Hidratação'],
      ['e-fc', 'Frequência Cardíaca (FC)'],
      ['e-fr', 'Frequência Respiratória (FR)'],
      ['e-linfonodos', 'Linfonodos'],
      ['e-obs', 'Observações gerais'],
    ]
  }

  const currentAnamnesisFields = anamnesisFields[clinic.type] || anamnesisFields.odonto
  const currentClinicalExamFields = clinicalExamFields[clinic.type] || clinicalExamFields.odonto

  return (
    <div className={styles.wrap}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Identificação</h3>
        <div className={styles.grid2}>
          {[
            ['p-cpf','CPF'], ['p-rg','RG'], ['p-nasc','Data de Nascimento'],
            ['p-genero','Gênero'], ['p-ocupacao','Ocupação'], ['p-endereco','Endereço'],
            ['p-indicado','Como nos conheceu'], ['p-emergencia','Contato de Emergência'],
            ...(clinic.type === 'vet' ? [
              ['p-pet_especie', 'Espécie do Pet'],
              ['p-pet_raca', 'Raça'],
              ['p-pet_idade', 'Idade do Pet'],
              ['p-pet_peso', 'Peso do Pet (kg)'],
              ['p-pet_castrado', 'Castrado?'],
            ] : [])
          ].map(([k,l]) => (
            <div className={styles.field} key={k}>
              <label>{l as string}</label>
              <input value={anamnesis[k as string] ?? ''} onChange={(e) => setA(k as string, e.target.value)} />
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Anamnese</h3>
        <div className={styles.grid2}>
          {currentAnamnesisFields.map(([k, label]) => aField(k, label))}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Exame Clínico</h3>
        <div className={styles.grid2}>
          {currentClinicalExamFields.map(([k, label]) => eField(k, label))}
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
