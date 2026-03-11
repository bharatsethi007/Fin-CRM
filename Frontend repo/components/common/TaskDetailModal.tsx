import React, { useState, useEffect, useMemo } from 'react';
import type { Task, TaskComment, Advisor } from '../../types';
import { crmService } from '../../services/api';
import { Modal } from './Modal';
import { Button } from './Button';
import { Icon } from './Icon';

interface TaskDetailModalProps {
  task: Task;
  onClose: () => void;
  onUpdate: () => void;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ task, onClose, onUpdate }) => {
  const [editableTask, setEditableTask] = useState({
      title: task.title,
      dueDate: task.dueDate,
      priority: task.priority,
      assigneeId: task.assigneeId || '',
      recurring: task.recurring || 'none'
  });
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [newComment, setNewComment] = useState('');
  
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPostingComment, setIsPostingComment] = useState(false);

  const hasChanges = useMemo(() => {
    return editableTask.title !== task.title ||
           editableTask.dueDate !== task.dueDate ||
           editableTask.priority !== task.priority ||
           editableTask.assigneeId !== (task.assigneeId || '') ||
           editableTask.recurring !== (task.recurring || 'none');
  }, [editableTask, task]);

  const fetchTaskData = async () => {
    setIsLoadingData(true);
    try {
        const [fetchedComments, fetchedAdvisors] = await Promise.all([
            crmService.getTaskComments(task.id),
            crmService.getAdvisors()
        ]);
        setComments(fetchedComments);
        setAdvisors(fetchedAdvisors);
    } catch (error) {
        console.error("Failed to fetch task data:", error);
    } finally {
        setIsLoadingData(false);
    }
  };

  useEffect(() => {
    fetchTaskData();
  }, [task.id]);
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditableTask(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
        await crmService.updateTask(task.id, {
            title: editableTask.title,
            dueDate: editableTask.dueDate,
            priority: editableTask.priority,
            assigneeId: editableTask.assigneeId,
            recurring: editableTask.recurring as Task['recurring'],
        });
        onUpdate();
    } catch (error: unknown) {
        console.error("Failed to save task:", error);
        const message = error instanceof Error ? error.message : 'Could not save task details.';
        alert(message);
        setIsSaving(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setIsPostingComment(true);
    try {
        const currentUser = await crmService.getAdvisor();
        await crmService.addTaskComment({
            taskId: task.id,
            content: newComment,
            authorId: currentUser.id,
            authorName: currentUser.name,
            authorAvatarUrl: currentUser.avatarUrl,
        });
        setNewComment('');
        await fetchTaskData(); // Re-fetch comments
    } catch (error) {
        console.error("Failed to add comment:", error);
        alert('Could not add comment.');
    } finally {
        setIsPostingComment(false);
    }
  };
  
  const timeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    let interval = seconds / 3600;
    if (interval > 24) return new Date(dateString).toLocaleDateString();
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return "Just now";
  };

  const inputClasses = "block w-full text-sm rounded-md border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:border-primary-500 focus:ring-primary-500 p-2";

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Task Details"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} isLoading={isSaving} disabled={!hasChanges}>Save Changes</Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Task Details Form */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Task Title</label>
          <input type="text" name="title" id="title" value={editableTask.title} onChange={handleChange} className={`${inputClasses} mt-1`} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
                <label htmlFor="assigneeId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Assignee</label>
                <select name="assigneeId" id="assigneeId" value={editableTask.assigneeId} onChange={handleChange} className={`${inputClasses} mt-1`}>
                    <option value="">Unassigned</option>
                    {advisors.map(adv => <option key={adv.id} value={adv.id}>{adv.name}</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Due Date</label>
                <input type="date" name="dueDate" id="dueDate" value={editableTask.dueDate} onChange={handleChange} className={`${inputClasses} mt-1`} />
            </div>
            <div>
                <label htmlFor="priority" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Priority</label>
                <select name="priority" id="priority" value={editableTask.priority} onChange={handleChange} className={`${inputClasses} mt-1`}>
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                </select>
            </div>
            <div>
                <label htmlFor="recurring" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Recurring</label>
                <select name="recurring" id="recurring" value={editableTask.recurring} onChange={handleChange} className={`${inputClasses} mt-1`}>
                    <option value="none">None</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                </select>
            </div>
        </div>
        
        {/* Comments Section */}
        <div className="border-t dark:border-gray-700 pt-6">
            <h4 className="text-md font-semibold mb-4 text-gray-800 dark:text-gray-200">Comments</h4>
             {isLoadingData ? (
                <div className="text-center py-4"><Icon name="Loader" className="h-6 w-6 animate-spin mx-auto text-gray-400" /></div>
            ) : (
                <div className="space-y-4 max-h-60 overflow-y-auto pr-2">
                    {comments.length > 0 ? comments.map(comment => (
                        <div key={comment.id} className="flex items-start gap-3">
                            <img src={comment.authorAvatarUrl} alt={comment.authorName} className="h-8 w-8 rounded-full flex-shrink-0" />
                            <div className="flex-grow p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                <div className="flex justify-between items-center">
                                    <p className="font-semibold text-sm">{comment.authorName}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{timeAgo(comment.createdAt)}</p>
                                </div>
                                <p className="mt-1 text-sm">{comment.content}</p>
                            </div>
                        </div>
                    )) : (
                        <p className="text-sm text-gray-500 text-center py-4">No comments yet.</p>
                    )}
                </div>
            )}
            <div className="mt-4 flex items-start gap-3">
                 <img src={advisors.find(a => a.id === 'adv_1')?.avatarUrl} alt="Current User" className="h-8 w-8 rounded-full flex-shrink-0" />
                 <div className="flex-grow">
                     <textarea
                        value={newComment}
                        onChange={e => setNewComment(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleAddComment())}
                        rows={2}
                        placeholder="Add a comment... (Enter to send, Shift+Enter for new line)"
                        className={`${inputClasses} w-full`}
                        disabled={isPostingComment}
                     />
                     <div className="text-right mt-2">
                         <Button size="sm" onClick={handleAddComment} isLoading={isPostingComment}>Post Comment</Button>
                     </div>
                 </div>
            </div>
        </div>
      </div>
    </Modal>
  );
};

