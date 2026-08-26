import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface InteractiveChartProps {
  data: number[];
  title: string;
}

export const InteractiveChart: React.FC<InteractiveChartProps> = ({ data, title }) => {
  const chartData = {
    labels: data.map((_, i) => `Point ${i + 1}`),
    datasets: [
      {
        label: title,
        data: data,
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        hoverBackgroundColor: 'rgba(255, 255, 255, 1)',
        borderRadius: 4,
        borderWidth: 0,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: title,
        color: 'rgba(255, 255, 255, 0.9)',
        font: {
          size: 14,
          weight: 'normal' as const,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: 'rgba(255,255,255,0.2)',
        borderWidth: 1,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.5)',
        },
      },
      x: {
        grid: {
          display: false,
        },
        ticks: {
          display: false, // hide x-axis labels for minimalistic look
        },
      },
    },
    animation: {
      duration: 500,
    },
  };

  return (
    <div className="interactive-chart-container" style={{ height: '200px', width: '100%', padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '16px' }}>
      <Bar data={chartData} options={options} />
    </div>
  );
};
