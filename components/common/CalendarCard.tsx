import React, { useState, useMemo } from 'react';
import type { Task } from '../../types';
import { Icon } from './Icon';
import { Button } from './Button';

interface CalendarCardProps {
  tasks: Task[];
  onDateSelect: (date: Date) => void;
  selectedDate: Date | null;
}

const areDatesSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
};

export const CalendarCard: React.FC<CalendarCardProps> = ({ tasks, onDateSelect, selectedDate }) => {
    const [displayDate, setDisplayDate] = useState(new Date());

    const taskDates = useMemo(() => {
        const dates = new Set<string>();
        tasks.forEach(task => {
            if (!task.isCompleted) {
                // Assuming dueDate is in 'YYYY-MM-DD' format
                dates.add(task.dueDate);
            }
        });
        return dates;
    }, [tasks]);

    const changeMonth = (amount: number) => {
        setDisplayDate(prev => {
            const newDate = new Date(prev);
            newDate.setDate(1); // Avoid issues with different month lengths
            newDate.setMonth(newDate.getMonth() + amount);
            return newDate;
        });
    };

    const calendarDays = useMemo(() => {
        const days = [];
        const year = displayDate.getFullYear();
        const month = displayDate.getMonth();
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);

        // JS getDay() is 0 for Sunday, so we align with that. Week starts on Sunday.
        let startDayOfWeek = firstDayOfMonth.getDay(); 
        const daysInMonth = lastDayOfMonth.getDate();

        // Add days from previous month
        for (let i = 0; i < startDayOfWeek; i++) {
            const date = new Date(year, month, 1 - (startDayOfWeek - i));
            days.push({ date, isCurrentMonth: false });
        }

        // Add days of current month
        for (let i = 1; i <= daysInMonth; i++) {
            const date = new Date(year, month, i);
            days.push({ date, isCurrentMonth: true });
        }

        // Add days from next month to fill grid
        const gridEndIndex = days.length + (7 - days.length % 7);
        if (days.length % 7 !== 0) {
            for (let i = days.length; i < gridEndIndex; i++) {
                const date = new Date(year, month, daysInMonth + (i - days.length + 1));
                days.push({ date, isCurrentMonth: false });
            }
        }

        return days;
    }, [displayDate]);
    
    const today = new Date();

    return (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
                <Button variant="ghost" size="sm" onClick={() => changeMonth(-1)}>
                    <Icon name="ArrowLeft" className="h-4 w-4" />
                </Button>
                <h3 className="text-lg font-semibold">
                    {displayDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                </h3>
                <Button variant="ghost" size="sm" onClick={() => changeMonth(1)}>
                    <Icon name="ArrowRight" className="h-4 w-4" />
                </Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 dark:text-gray-400 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day}>{day}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {calendarDays.map(({ date, isCurrentMonth }, index) => {
                    const dateString = date.toISOString().split('T')[0];
                    const hasTask = taskDates.has(dateString);
                    const isSelected = selectedDate ? areDatesSameDay(date, selectedDate) : false;
                    const isToday = areDatesSameDay(date, today);
                    
                    let dayClasses = 'h-10 w-10 flex items-center justify-center rounded-full transition-colors duration-200 relative';
                    
                    if (!isCurrentMonth) {
                        dayClasses += ' text-gray-300 dark:text-gray-600 cursor-default';
                    } else {
                         dayClasses += ' cursor-pointer';
                         if (isSelected) {
                            dayClasses += ' bg-primary-600 text-white font-bold';
                        } else if (isToday) {
                            dayClasses += ' bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300';
                        } else {
                            dayClasses += ' hover:bg-gray-100 dark:hover:bg-gray-700';
                        }
                    }

                    return (
                        <button key={index} onClick={() => isCurrentMonth && onDateSelect(date)} disabled={!isCurrentMonth} className={dayClasses}>
                            {date.getDate()}
                            {isCurrentMonth && hasTask && (
                                <span className={`absolute bottom-1.5 h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-red-500'}`}></span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
