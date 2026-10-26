import './create-timetable.js';
import './create-timetable-import.js';
import './create-drafts.js';
window.classMatchTimetableReady = true;
if (window.classMatchPendingTimetable) window.dispatchEvent(new CustomEvent('classmatch:restore-timetable', { detail: window.classMatchPendingTimetable }));
