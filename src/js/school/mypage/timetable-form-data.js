// Optional form data only: tournament persistence never imports a scheduler,
// timetable renderer or timetable validator.
export function collectTimetableForm() {
  const timings = document.getElementById('timetable-sports');
  const days = document.getElementById('timetable-days');
  if (!timings || !days) return null;
  return {
    settings: {
      sportTimings: Object.fromEntries([...timings.children].map(row => [row.dataset.sportId, Object.fromEntries(['matchMinutes', 'beforeMinutes', 'afterMinutes'].map(key => {
        const value = row.querySelector(`.${key}`)?.value;
        return [key, value === '' || value === undefined ? null : Number(value)];
      }))])),
      days: [...days.children].map(day => ({ date: day.querySelector('.day-date').value,
        availableTimes: [...day.querySelectorAll('.timetable-window')].map(row => ({ startTime: row.querySelector('.start-time').value, endTime: row.querySelector('.end-time').value })),
        events: [...day.querySelectorAll('.timetable-event')].map(row => { const target = row.querySelector('.event-sport')?.value; return ({ sportId: target && target !== '__each_sport__' ? target : undefined, scope: target === '__each_sport__' ? 'each-sport' : undefined, name: row.querySelector('.event-name').value, startMode: row.querySelector('.event-start-mode')?.value === 'after-morning-matches' ? 'after-morning-matches' : undefined, startTime: row.querySelector('.start-time').value || undefined, endTime: row.querySelector('.end-time').value }); })
      }))
    },
    instructions: document.getElementById('timetable-instructions')?.value ?? '',
    json: document.getElementById('timetable-json-input')?.value ?? ''
  };
}
