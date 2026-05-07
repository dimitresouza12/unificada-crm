'use client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import styles from './financeiro.module.css'

const COLORS = ['#7C3AED', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']

interface MonthlyData { month: string; receita: number; despesa: number }
interface CategoryData { name: string; value: number }

const fmt = (v: number | string | undefined) => typeof v === 'number' ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : String(v ?? '')

export default function FinanceiroCharts({ monthlyData, categoryData }: { monthlyData: MonthlyData[]; categoryData: CategoryData[] }) {
  return (
    <div className={styles.charts}>
      {/* Bar chart */}
      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}>Receitas vs Despesas — últimos 6 meses</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={72} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-md)' }} />
            <Bar dataKey="receita" name="Receita" fill="#10B981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="despesa" name="Despesa" fill="#EF4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pie chart */}
      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}>Receitas por categoria</h3>
        {categoryData.length === 0 ? (
          <div className={styles.chartEmpty}>Sem dados para o período</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={categoryData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                paddingAngle={3} dataKey="value" nameKey="name"
                label={({ name, percent }) => percent != null ? `${name} ${(percent * 100).toFixed(0)}%` : name}
                labelLine={false}
              >
                {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
