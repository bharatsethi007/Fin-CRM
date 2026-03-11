import React, { useState, useEffect, useMemo } from 'react';
import { crmService } from '../../services/api';
import type { Task, Advisor } from '../../types';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { Card } from '../common/Card';
import { CalendarCard } from '../common/CalendarCard';
import { TaskDetailModal } from '../common/TaskDetailModal';
import { AddTaskModal } from '../common/AddTaskModal';

const priorityClasses = {
  High: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  Medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  Low: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

const TaskItem: React.FC<{
  task: Task;
  advisors: Advisor[];
  onToggle: (id: string) => void;
  onSelect: () => void;
  onChangeAssignee: (taskId: string, advisorId: string | null) => void;
}> = ({ task, advisors, onToggle, onSelect, onChangeAssignee }) => {
  const isOverdue = !task.isCompleted && new Date(task.dueDate) < new Date(new Date().toDateString());
  const [showAssigneeMenu, setShowAssigneeMenu] = useState(false);

  const currentAdvisor = advisors.find(a => a.id === task.assigneeId);
  const assigneeName = task.assigneeName || currentAdvisor?.name;
  const assigneeAvatar = task.assigneeAvatarUrl || currentAdvisor?.avatarUrl;

  return (
    <li className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center flex-grow min-w-0">
          <input
            type="checkbox"
            checked={task.isCompleted}
            onChange={(e) => { e.stopPropagation(); onToggle(task.id); }}
            className="h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 flex-shrink-0"
          />
          <div className="ml-4 cursor-pointer min-w-0" onClick={onSelect}>
            <p className={`font-medium truncate ${task.isCompleted ? 'line-through text-gray-500' : ''}`}>{task.title}</p>
            <p className={`text-xs ${isOverdue ? 'text-red-500 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
              Due: {task.dueDate}
            </p>
          </div>
        </div>
        <div className="relative flex items-center space-x-3 flex-shrink-0 ml-4">
          {isOverdue && <Icon name="ShieldAlert" className="h-5 w-5 text-red-500" title="This task is overdue" />}
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${priorityClasses[task.priority]}`}>
            {task.priority}
          </span>
          <button
            type="button"
            className="h-7 w-7 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center hover:ring-2 hover:ring-primary-500"
            title={assigneeName ? `Assigned to ${assigneeName}` : 'Assign task'}
            onClick={(e) => {
              e.stopPropagation();
              setShowAssigneeMenu((open) => !open);
            }}
          >
            {assigneeAvatar ? (
              <img
                src={assigneeAvatar}
                alt={assigneeName || 'Assignee'}
                className="h-7 w-7 rounded-full"
              />
            ) : (
              <Icon name="UserCog" className="h-4 w-4 text-gray-400" />
            )}
          </button>
          {showAssigneeMenu && (
            <div
              className="absolute right-0 top-9 z-20 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 text-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => {
                  onChangeAssignee(task.id, null);
                  setShowAssigneeMenu(false);
                }}
              >
                Unassigned
              </button>
              {advisors.map((advisor) => (
                <button
                  key={advisor.id}
                  type="button"
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  onClick={() => {
                    onChangeAssignee(task.id, advisor.id);
                    setShowAssigneeMenu(false);
                  }}
                >
                  <span className="inline-flex h-5 w-5 rounded-full bg-gray-200 dark:bg-gray-600 items-center justify-center">
                    {advisor.avatarUrl ? (
                      <img
                        src={advisor.avatarUrl}
                        alt={advisor.name}
                        className="h-5 w-5 rounded-full"
                      />
                    ) : (
                      <Icon name="User" className="h-3 w-3 text-gray-500" />
                    )}
                  </span>
                  <span className="truncate">{advisor.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
};


const TaskList: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);

  const fetchData = () => {
    setIsLoading(true);
    Promise.all([crmService.getTasks(), crmService.getAdvisors()])
      .then(([tasksData, advisorsData]) => {
        setTasks(tasksData.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()));
        setAdvisors(advisorsData);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);
  
  const tasksForSelectedDate = useMemo(() => {
    if (!selectedDate || !tasks) return [];
    const selectedDateString = selectedDate.toISOString().split('T')[0];
    return tasks.filter(task => task.dueDate === selectedDateString && !task.isCompleted);
  }, [selectedDate, tasks]);

  const handleToggleTask = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (task) {
      crmService.updateTask(id, { isCompleted: !task.isCompleted })
        .then(() => fetchData())
        .catch(() => fetchData());
    }
  };

  const handleChangeAssignee = (taskId: string, advisorId: string | null) => {
    crmService.updateTask(taskId, { assigneeId: advisorId ?? '' })
      .then(() => fetchData())
      .catch((err) => {
        console.error('Failed to update assignee', err);
        fetchData();
      });
  };
  
  const { overdueTasks, todoTasks, complianceTasks, completedTasks } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const incomplete = tasks.filter(t => !t.isCompleted);
    const completed = tasks.filter(t => t.isCompleted);
    
    const compliance = incomplete.filter(t => t.category === 'compliance');
    const nonCompliance = incomplete.filter(t => t.category !== 'compliance');
    
    const overdue = nonCompliance.filter(t => new Date(t.dueDate) < today);
    const todo = nonCompliance.filter(t => new Date(t.dueDate) >= today);

    return {
        overdueTasks: overdue,
        todoTasks: todo,
        complianceTasks: compliance,
        completedTasks: completed
    };
  }, [tasks]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">My Tasks</h2>
          <p className="text-gray-500 dark:text-gray-400">Stay on top of your priorities.</p>
        </div>
        <Button leftIcon="PlusCircle" onClick={() => setShowAddModal(true)}>Add Task</Button>
      </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-96">
            <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column */}
            <div className="space-y-6">
                <CalendarCard
                    tasks={tasks}
                    onDateSelect={(date) => setSelectedDate(date)}
                    selectedDate={selectedDate}
                />
                {selectedDate && (
                <Card>
                    <h3 className="text-md font-semibold mb-3">
                        Tasks for {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </h3>
                    <div className="space-y-2">
                    {tasksForSelectedDate.length > 0 ? (
                      tasksForSelectedDate.map(task => (
                        <div 
                          key={task.id} 
                          className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 flex justify-between items-center" 
                          onClick={() => setSelectedTask(task)}
                        >
                          <p className="font-medium text-sm">{task.title}</p>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${priorityClasses[task.priority]}`}>
                              {task.priority}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No tasks due on this day.</p>
                    )}
                  </div>
                </Card>
              )}
            </div>

            {/* Right Column */}
            <div className="space-y-6">
                <Card className="!p-0 overflow-hidden">
                    <div className="p-4 bg-red-500 text-white flex justify-between items-center">
                        <h3 className="text-lg font-semibold">Overdue ({overdueTasks.length})</h3>
                        <Icon name="AlertTriangle" className="h-6 w-6" />
                    </div>
                    <ul className="space-y-2 p-4 max-h-[15rem] overflow-y-auto">
                        {overdueTasks.length > 0 ? overdueTasks.map(task => (
                            <TaskItem
                              key={task.id}
                              task={task}
                              advisors={advisors}
                              onToggle={handleToggleTask}
                              onSelect={() => setSelectedTask(task)}
                              onChangeAssignee={handleChangeAssignee}
                            />
                        )) : <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No overdue tasks. Great job!</p>}
                    </ul>
                </Card>

                <Card className="!p-0 overflow-hidden">
                    <div className="p-4 border-b dark:border-gray-700">
                        <h3 className="text-lg font-semibold">To-Do ({todoTasks.length})</h3>
                    </div>
                    <ul className="space-y-2 p-4 max-h-[15rem] overflow-y-auto">
                      {todoTasks.length > 0 ? todoTasks.map(task => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          advisors={advisors}
                          onToggle={handleToggleTask}
                          onSelect={() => setSelectedTask(task)}
                          onChangeAssignee={handleChangeAssignee}
                        />
                      )) : <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">All caught up!</p>}
                    </ul>
                </Card>
                
                <Card className="!p-0 overflow-hidden">
                    <div className="p-4 border-b dark:border-gray-700">
                        <h3 className="text-lg font-semibold">Compliance ({complianceTasks.length})</h3>
                    </div>
                    <ul className="space-y-2 p-4 max-h-[15rem] overflow-y-auto">
                      {complianceTasks.length > 0 ? complianceTasks.map(task => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          advisors={advisors}
                          onToggle={handleToggleTask}
                          onSelect={() => setSelectedTask(task)}
                          onChangeAssignee={handleChangeAssignee}
                        />
                      )) : <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No compliance tasks due.</p>}
                    </ul>
                </Card>

                <Card className="!p-0 overflow-hidden">
                    <div className="p-4 border-b dark:border-gray-700">
                        <h3 className="text-lg font-semibold">Completed ({completedTasks.length})</h3>
                    </div>
                    <ul className="space-y-2 p-4 max-h-[15rem] overflow-y-auto">
                      {completedTasks.map(task => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          advisors={advisors}
                          onToggle={handleToggleTask}
                          onSelect={() => setSelectedTask(task)}
                          onChangeAssignee={handleChangeAssignee}
                        />
                      ))}
                    </ul>
                </Card>
            </div>
          </div>
        )}

      {selectedTask && (
        <TaskDetailModal
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
            onUpdate={() => {
                setSelectedTask(null);
                fetchData();
            }}
        />
      )}

      {showAddModal && (
        <AddTaskModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
};

export default TaskList;

