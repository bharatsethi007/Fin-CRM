
import React, { useState, useEffect } from 'react';
import { crmService } from '../../services/crmService';
import type { Task } from '../../types';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { Card } from '../common/Card';

const priorityClasses = {
  High: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  Medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  Low: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

const TaskItem: React.FC<{ task: Task; onToggle: (id: string) => void }> = ({ task, onToggle }) => (
  <li className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
    <div className="flex items-center">
      <input
        type="checkbox"
        checked={task.isCompleted}
        onChange={() => onToggle(task.id)}
        className="h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
      />
      <div className="ml-4">
        <p className={`font-medium ${task.isCompleted ? 'line-through text-gray-500' : ''}`}>{task.title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">Due: {task.dueDate}</p>
      </div>
    </div>
    <div className="flex items-center space-x-4">
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${priorityClasses[task.priority]}`}>
            {task.priority}
        </span>
    </div>
  </li>
);


const TaskList: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    crmService.getTasks().then(data => {
      setTasks(data);
      setIsLoading(false);
    });
  }, []);

  const handleToggleTask = (id: string) => {
    setTasks(tasks.map(task => 
      task.id === id ? { ...task, isCompleted: !task.isCompleted } : task
    ));
  };
  
  const incompleteTasks = tasks.filter(t => !t.isCompleted);
  const completedTasks = tasks.filter(t => t.isCompleted);

  return (
    <Card>
      <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">My Tasks</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Stay on top of your priorities.</p>
        </div>
        <Button leftIcon="PlusCircle">Add Task</Button>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <Icon name="Loader" className="h-8 w-8 animate-spin text-primary-500" />
          </div>
        ) : (
          <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold mb-3">To-Do ({incompleteTasks.length})</h3>
                <ul className="space-y-2">
                    {incompleteTasks.map(task => (
                        <TaskItem key={task.id} task={task} onToggle={handleToggleTask} />
                    ))}
                </ul>
            </div>
             <div>
                <h3 className="text-lg font-semibold mb-3">Completed ({completedTasks.length})</h3>
                <ul className="space-y-2">
                    {completedTasks.map(task => (
                        <TaskItem key={task.id} task={task} onToggle={handleToggleTask} />
                    ))}
                </ul>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default TaskList;
