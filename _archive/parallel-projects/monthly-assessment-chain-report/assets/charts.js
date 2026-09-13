/* 月度安全履职自动考核链路改造总结报告 —— 图表定义 */
(function () {
  var ACCENT = '#1b8a5a';
  var ACCENT2 = '#2b6cb0';

  // ===== 图 2：网格长等级分布（grid_areas，61 个网格区域） =====
  var gridLevelEl = document.getElementById('chart-grid-level');
  if (gridLevelEl && window.echarts) {
    var g = echarts.init(gridLevelEl);
    g.setOption({
      color: ['#1b8a5a', '#3ba574', '#7fbf9b', '#c3e0d0'],
      tooltip: { trigger: 'item', formatter: '{b}<br/>{c} 个区域（{d}%）' },
      series: [{
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '52%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { formatter: '{b}\n{c} ({d}%)', color: '#16211a' },
        data: [
          { name: '总网格长', value: 1 },
          { name: '一级网格长', value: 5 },
          { name: '二级网格长', value: 11 },
          { name: '三级网格长', value: 44 }
        ]
      }]
    });
    window.addEventListener('resize', function () { g.resize(); });
  }

  // ===== 图 3：自动扣分指标按业务模块分布（14 项） =====
  var metricEl = document.getElementById('chart-metric-cat');
  if (metricEl && window.echarts) {
    var m = echarts.init(metricEl);
    m.setOption({
      color: [ACCENT, ACCENT2, '#c98a1b', '#8a5ec9', '#d0566b', '#3a8ba8'],
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 8, right: 20, bottom: 8, top: 30, containLabel: true },
      xAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: '#e0e7e2' } },
        axisLabel: { color: '#5c6b62' }
      },
      yAxis: {
        type: 'category',
        data: ['目标职责', '培训', '网格', '隐患', '事故', '三违'],
        axisLabel: { color: '#16211a' },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      series: [{
        type: 'bar',
        barWidth: 22,
        itemStyle: { borderRadius: [0, 6, 6, 0] },
        label: { show: true, position: 'right', color: '#5c6b62' },
        data: [
          { name: '目标职责', value: 3 },
          { name: '培训', value: 3 },
          { name: '网格', value: 3 },
          { name: '隐患', value: 3 },
          { name: '事故', value: 1 },
          { name: '三违', value: 1 }
        ]
      }]
    });
    window.addEventListener('resize', function () { m.resize(); });
  }
})();