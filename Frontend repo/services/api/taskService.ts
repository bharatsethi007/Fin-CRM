import type { Task } from '../../types';
import { logger } from '../../utils/logger';
import { supabase } from '../supabaseClient';
import { authService } from './authService';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const taskService = {
  getTasks: async (): Promise<Task[]> => {
    const currentFirm = authService.getCurrentFirm();
    if (!currentFirm || !UUID_REGEX.test(currentFirm.id)) return [];
    try {
        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('firm_id', currentFirm.id)
            .order('due_date', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false });
        if (error) throw error;

        const userIds = [...new Set((data || []).map(t => t.assigned_to).filter(Boolean))] as string[];
        const usersMap = new Map<string, { name: string; avatar_url?: string }>();
        if (userIds.length > 0) {
            const { data: advisorsData, error: advisorsError } = await supabase
              .from('advisors')
              .select('id, first_name, last_name, avatar_url')
              .in('id', userIds);
            if (!advisorsError) {
              (advisorsData || []).forEach(u =>
                usersMap.set(u.id, {
                  name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.id,
                  avatar_url: u.avatar_url || undefined,
                })
              );
            }
        }

        return (data || []).map(t => {
            const assignee = t.assigned_to ? usersMap.get(t.assigned_to) : undefined;
            const priorityMap: Record<string, 'High' | 'Medium' | 'Low'> = {
                low: 'Low', medium: 'Medium', high: 'High',
            };
            const isCompleted = t.status === 'completed';
            const taskType = t.task_type || 'to_do';
            return {
                id: t.id,
                firmId: t.firm_id,
                title: t.title,
                description: t.description,
                dueDate: t.due_date ? new Date(t.due_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
                dueTime: t.due_time,
                isCompleted,
                priority: priorityMap[t.priority] || 'Medium',
                taskType: taskType as Task['taskType'],
                status: t.status as Task['status'],
                clientId: t.client_id,
                applicationId: t.application_id,
                assigneeId: t.assigned_to,
                assigneeName: assignee?.name,
                assigneeAvatarUrl: assignee?.avatar_url,
                category: taskType === 'compliance' ? 'compliance' : undefined,
                completedAt: t.completed_at,
                createdAt: t.created_at,
                updatedAt: t.updated_at,
            };
        });
    } catch (err) {
        logger.error('Failed to load tasks:', err);
        return [];
    }
  },
  
  createTask: async (taskData: {
    title: string;
    description?: string;
    taskType?: string;
    priority?: string;
    clientId?: string;
    applicationId?: string;
    assignedTo?: string;
    dueDate: string;
    dueTime?: string;
  }): Promise<Task> => {
    const currentFirm = authService.getCurrentFirm();
    const currentUser = authService.getCurrentUser();

    if (!currentFirm || !UUID_REGEX.test(currentFirm.id)) {
      throw new Error('No valid firm session. Please log in again.');
    }
    if (!currentUser) throw new Error('Not logged in');

    const currentUserId = currentUser.id;
    const userUuid = UUID_REGEX.test(currentUserId) ? currentUserId : null;

    const { data, error } = await supabase
        .from('tasks')
        .insert([{
            firm_id: currentFirm.id,
            title: taskData.title,
            description: taskData.description || null,
            task_type: taskData.taskType || 'to_do',
            priority: (taskData.priority || 'medium').toLowerCase(),
            client_id: taskData.clientId || null,
            application_id: taskData.applicationId || null,
            assigned_to: (taskData.assignedTo && UUID_REGEX.test(taskData.assignedTo)) ? taskData.assignedTo : null,
            due_date: taskData.dueDate || null,
            due_time: taskData.dueTime || null,
            status: 'pending',
            created_by: userUuid,
        }])
        .select()
        .single();
    if (error) throw error;

    const isCompleted = data.status === 'completed';
    const priority: 'High' | 'Medium' | 'Low' =
      data.priority === 'high' ? 'High' : data.priority === 'low' ? 'Low' : 'Medium';

    return {
      id: data.id,
      firmId: data.firm_id,
      title: data.title,
      description: data.description,
      dueDate: data.due_date ? new Date(data.due_date).toISOString().slice(0, 10) : '',
      dueTime: data.due_time || undefined,
      isCompleted,
      priority,
      taskType: (data.task_type || 'to_do') as Task['taskType'],
      status: data.status as Task['status'],
      clientId: data.client_id || undefined,
      applicationId: data.application_id || undefined,
      assigneeId: data.assigned_to || undefined,
      category: data.task_type === 'compliance' ? 'compliance' : undefined,
      completedAt: data.completed_at || undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  },

  updateTask: async (
    id: string,
    updates: Partial<{
      title: string;
      description: string;
      dueDate: string;
      dueTime: string;
      priority: Task['priority'];
      status: Task['status'];
      isCompleted: boolean;
      assignedId: string;
      assigneeId: string;
      clientId: string;
      applicationId: string;
      taskType: Task['taskType'];
      recurring: Task['recurring'];
    }>
  ): Promise<void> => {
    const currentFirm = authService.getCurrentFirm();
    if (!currentFirm || !UUID_REGEX.test(currentFirm.id)) {
      throw new Error('No valid firm session. Please log in again.');
    }

    const dbUpdates: Record<string, unknown> = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate || null;
    if (updates.dueTime !== undefined) dbUpdates.due_time = updates.dueTime || null;
    if (updates.priority !== undefined) dbUpdates.priority = updates.priority.toLowerCase();
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.isCompleted !== undefined) {
      dbUpdates.status = updates.isCompleted ? 'completed' : 'pending';
      dbUpdates.completed_at = updates.isCompleted ? new Date().toISOString() : null;
    }
    const assignee = updates.assigneeId ?? updates.assignedId;
    if (assignee !== undefined) {
      dbUpdates.assigned_to = assignee && UUID_REGEX.test(assignee) ? assignee : null;
    }
    if (updates.clientId !== undefined) dbUpdates.client_id = updates.clientId || null;
    if (updates.applicationId !== undefined) dbUpdates.application_id = updates.applicationId || null;
    if (updates.taskType !== undefined) dbUpdates.task_type = updates.taskType;
    if (updates.recurring !== undefined) dbUpdates.recurring = updates.recurring;

    if (Object.keys(dbUpdates).length === 0) return;

    const { error } = await supabase
      .from('tasks')
      .update(dbUpdates)
      .eq('id', id)
      .eq('firm_id', currentFirm.id);

    if (error) {
      logger.error('Error updating task:', error);
      throw new Error(error.message);
    }
  },

  deleteTask: async (id: string): Promise<void> => {
    const currentFirm = authService.getCurrentFirm();
    if (!currentFirm || !UUID_REGEX.test(currentFirm.id)) {
      throw new Error('No valid firm session. Please log in again.');
    }

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)
      .eq('firm_id', currentFirm.id);

    if (error) {
      logger.error('Error deleting task:', error);
      throw new Error(error.message);
    }
  },
};
