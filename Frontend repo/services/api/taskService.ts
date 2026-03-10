import type { Task } from '../../types';
import { supabase } from '../supabaseClient';
import { authService } from './authService';
import { toSupabaseFirmId } from './clientService';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const taskService = {
  getTasks: async (): Promise<Task[]> => {
    const currentFirm = authService.getCurrentFirm();
    if (!currentFirm) return [];
    try {
        const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('firm_id', supabaseFirmId)
            .order('due_date', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false });
        if (error) throw error;

        const userIds = [...new Set((data || []).map(t => t.assigned_to).filter(Boolean))] as string[];
        const usersMap = new Map<string, { name: string; photo_url?: string }>();
        if (userIds.length > 0) {
            const { data: usersData } = await supabase.from('users').select('id, first_name, last_name, photo_url').in('id', userIds);
            (usersData || []).forEach(u => usersMap.set(u.id, { name: `${u.first_name || ''} ${u.last_name || ''}`.trim(), photo_url: u.photo_url }));
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
                assigneeAvatarUrl: assignee?.photo_url,
                category: taskType === 'compliance' ? 'compliance' : undefined,
                completedAt: t.completed_at,
                createdAt: t.created_at,
                updatedAt: t.updated_at,
            };
        });
    } catch (err) {
        console.error('Failed to load tasks:', err);
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
    
    if (!currentFirm || !currentUser) throw new Error('Not logged in');
    
    const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
    const currentUserId = currentUser.id;
    const userUuid = UUID_REGEX.test(currentUserId) ? currentUserId : null;

    const { data, error } = await supabase
        .from('tasks')
        .insert([{
            firm_id: supabaseFirmId,
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

    return {
        id: data.id,
        firmId: data.firm_id,
        title: data.title,
        description: data.description,
        dueDate: data.due_date ? new Date(data.due_date).toISOString().slice(0, 10) : '',
        isCompleted: false,
        priority: (data.priority === 'high' ? 'High' : data.priority === 'low' ? 'Low' : 'Medium') as 'High' | 'Medium' | 'Low',
        taskType: (data.task_type || 'to_do') as Task['taskType'],
        status: data.status,
        clientId: data.client_id,
        applicationId: data.application_id,
        assigneeId: data.assigned_to,
        category: data.task_type === 'compliance' ? 'compliance' : undefined,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
    };
  },
};
