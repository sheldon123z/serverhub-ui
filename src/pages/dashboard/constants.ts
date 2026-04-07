import * as echarts from 'echarts/core'
import {
  Monitor, Cpu, MemoryStick, HardDrive, Network,
  Activity, Container, Thermometer, Disc3,
} from 'lucide-react'
import type { CardConfig, HistoryPeriod } from './types'

export const THEME_NAME = 'serverhub-dark'
export const ECHARTS_COLORS = ['#38bdf8', '#4ade80', '#fbbf24', '#f87171', '#a78bfa', '#fb923c']

echarts.registerTheme(THEME_NAME, {
  backgroundColor: 'transparent',
  color: ECHARTS_COLORS,
  tooltip: {
    backgroundColor: 'rgba(15,23,42,0.95)',
    borderColor: '#334155',
    textStyle: { color: '#e2e8f0', fontSize: 12 },
  },
  legend: { textStyle: { color: '#94a3b8' } },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#334155' } },
    axisTick: { lineStyle: { color: '#334155' } },
    axisLabel: { color: '#64748b' },
    splitLine: { lineStyle: { color: '#1e293b' } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: '#334155' } },
    axisTick: { lineStyle: { color: '#334155' } },
    axisLabel: { color: '#64748b' },
    splitLine: { lineStyle: { color: '#1e293b' } },
  },
})

export const LIGHT_THEME_NAME = 'serverhub-light'

echarts.registerTheme(LIGHT_THEME_NAME, {
  backgroundColor: 'transparent',
  color: ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#ff6b00'],
  tooltip: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(255,255,255,0.95)',
    textStyle: { color: '#1c1c1e', fontSize: 12 },
  },
  legend: { textStyle: { color: 'rgba(60,60,67,0.55)' } },
  categoryAxis: {
    axisLine: { lineStyle: { color: 'rgba(0,0,0,0.08)' } },
    axisTick: { lineStyle: { color: 'rgba(0,0,0,0.08)' } },
    axisLabel: { color: 'rgba(60,60,67,0.38)' },
    splitLine: { lineStyle: { color: 'rgba(0,0,0,0.05)' } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: 'rgba(0,0,0,0.08)' } },
    axisTick: { lineStyle: { color: 'rgba(0,0,0,0.08)' } },
    axisLabel: { color: 'rgba(60,60,67,0.38)' },
    splitLine: { lineStyle: { color: 'rgba(0,0,0,0.05)' } },
  },
})

export const CARDS: CardConfig[] = [
  { id: 'host', label: '主机状态', icon: Monitor },
  { id: 'cpu', label: 'CPU', icon: Cpu },
  { id: 'memory', label: '内存', icon: MemoryStick },
  { id: 'swap', label: 'Swap', icon: Disc3 },
  { id: 'disk', label: '磁盘', icon: HardDrive },
  { id: 'network', label: '网络', icon: Network },
  { id: 'diskio', label: '磁盘 I/O', icon: Activity },
  { id: 'docker', label: 'Docker', icon: Container },
  { id: 'gpu', label: 'GPU', icon: Thermometer },
]

export const PERIOD_OPTIONS: { value: HistoryPeriod; label: string }[] = [
  { value: '1', label: '1h' },
  { value: '6', label: '6h' },
  { value: '24', label: '24h' },
  { value: '72', label: '3d' },
]
