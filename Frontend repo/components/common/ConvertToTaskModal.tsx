import React, { useState } from 'react';
import type { Note, Task } from '../../types';
import { crmService } from '../../services/api';
import { Modal } from './Modal';
import { Button } from './Button';
import { Icon } from './Icon';

interface ConvertToTaskModalProps {
  note: Note;
  onClose: () => void;
  onTaskCreated: (task: Task) => void;
}

export const ConvertToTaskModal: React.FC<ConvertToTaskModalProps> = ({ note, onClose, onTaskCreated }) => {
  const [title, setTitle] = useState(note.content.substring(0, 100)); // Truncate long notes for title
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [isLoading, setIsLoading] = useState(false);

  const handleCreateTask = async () => {
    if (!title.trim() || !dueDate) {
      alert('Please provide a title and a due date.');
      return;
    }
    setIsLoading(true);
    try {
      const newTask = await crmService.addTask({
        title,
        dueDate,
        priority,
        clientId: note.clientId,
      });
      onTaskCreated(newTask);
      onClose();
    } catch (error) {
      console.error('Failed to create task:', error);
      alert('There was an error creating the task. Please try again.');
      setIsLoading(false);
    }
  };
  
  const inputClasses = "block w-full rounded-md border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2";

  return (
    <Modal 
        isOpen={true} 
        onClose={onClose} 
        title="Convert Note to Task"
        footer={
            <>
                <Button variant="secondary" onClick={onClose} disabled={isLoading}>
                Cancel
                </Button>
                <Button onClick={handleCreateTask} isLoading={isLoading}>
                Create Task
                </Button>
            </>
        }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="task-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Task Title
          </label>
          <textarea
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            rows={3}
            className={`${inputClasses} mt-1`}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
            <div>
                <label htmlFor="task-duedate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Due Date
                </label>
                <input
                    type="date"
                    id="task-duedate"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className={`${inputClasses} mt-1`}
                />
            </div>
            <div>
                <label htmlFor="task-priority" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Priority
                </label>
                <select
                    id="task-priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as 'High' | 'Medium' | 'Low')}
                    className={`${inputClasses} mt-1`}
                >
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                </select>
            </div>
        </div>
        
      </div>
       <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-900 rounded-md border border-dashed dark:border-gray-700">
            <p className="text-sm font-semibold">Original Note:</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 italic">"{note.content}"</p>
        </div>
    </Modal>
  );
};

