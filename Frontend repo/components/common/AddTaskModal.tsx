import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { crmService } from '../../services/api';
import type { Task, Client, Advisor } from '../../types';

const TASK_TYPES = [
  { value: 'to_do', label: 'To-Do' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'document_request', label: 'Document Request' },
  { value: 'call', label: 'Call' },
  { value: 'meeting', label: 'Meeting' },
] as const;

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddTaskModal: React.FC<AddTaskModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState<string>('to_do');
  const [priority, setPriority] = useState<string>('medium');
  const [clientId, setClientId] = useState<string>('');
  const [applicationId, setApplicationId] = useState<string>('');
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueTime, setDueTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [applications, setApplications] = useState<{ id: string; referenceNumber: string; clientId: string }[]>([]);

  useEffect(() => {
    if (isOpen) {
      Promise.all([
        crmService.getClients(),
        crmService.getAdvisors(),
        crmService.getApplications(),
      ]).then(([clientsData, advisorsData, appsData]) => {
        setClients(clientsData);
        setAdvisors(advisorsData);
        setApplications(appsData.map(a => ({ id: a.id, referenceNumber: a.referenceNumber, clientId: a.clientId })));
      });
    }
  }, [isOpen]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await crmService.createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        taskType,
        priority,
        clientId: clientId || undefined,
        applicationId: applicationId || undefined,
        assignedTo: assignedTo || undefined,
        dueDate,
        dueTime: dueTime || undefined,
      });
      onSuccess();
      onClose();
      setTitle('');
      setDescription('');
      setTaskType('to_do');
      setPriority('medium');
      setClientId('');
      setApplicationId('');
      setAssignedTo('');
      setDueDate(new Date().toISOString().slice(0, 10));
      setDueTime('');
    } catch (err: any) {
      setError(err?.message || 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClasses = 'block w-full text-sm rounded-md border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:border-primary-500 focus:ring-primary-500 p-2';

  const filteredApplications = clientId
    ? applications.filter(a => a.clientId === clientId)
    : applications;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Task"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => handleSubmit()} isLoading={isSubmitting}>Create Task</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className={inputClasses}
            placeholder="Task title"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            className={inputClasses}
            rows={2}
            placeholder="Optional description"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Task Type</label>
            <select value={taskType} onChange={e => setTaskType(e.target.value)} className={inputClasses}>
              {TASK_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} className={inputClasses}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client</label>
            <select value={clientId} onChange={e => { setClientId(e.target.value); setApplicationId(''); }} className={inputClasses}>
              <option value="">None</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Application</label>
            <select value={applicationId} onChange={e => setApplicationId(e.target.value)} className={inputClasses} disabled={!clientId}>
              <option value="">None</option>
              {filteredApplications.map(a => (
                <option key={a.id} value={a.id}>{a.referenceNumber}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Assignee</label>
            <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className={inputClasses}>
              <option value="">Unassigned</option>
              {advisors.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className={inputClasses}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Due Time (optional)</label>
          <input
            type="time"
            value={dueTime}
            onChange={e => setDueTime(e.target.value)}
            className={inputClasses}
          />
        </div>
      </form>
    </Modal>
  );
};

