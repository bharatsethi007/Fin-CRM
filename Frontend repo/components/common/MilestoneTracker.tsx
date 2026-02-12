import React from 'react';
import { ApplicationStatus } from '../../types';
import { Icon } from './Icon';
import type { IconName } from './Icon';

const MILESTONES: { status: ApplicationStatus; label: string, icon: IconName }[] = [
    { status: ApplicationStatus.Draft, label: 'Draft', icon: 'Pencil' },
    { status: ApplicationStatus.ApplicationSubmitted, label: 'Submitted', icon: 'Send' },
    { status: ApplicationStatus.ConditionalApproval, label: 'Conditional', icon: 'FileText' },
    { status: ApplicationStatus.UnconditionalApproval, label: 'Unconditional', icon: 'FileBadge2' },
    { status: ApplicationStatus.Settled, label: 'Settled', icon: 'Landmark' },
];

interface MilestoneTrackerProps {
    currentStatus: ApplicationStatus;
}

export const MilestoneTracker: React.FC<MilestoneTrackerProps> = ({ currentStatus }) => {
    const currentIndex = MILESTONES.findIndex(m => m.status === currentStatus);
    const isDeclined = currentStatus === ApplicationStatus.Declined;

    return (
        <div className="w-full px-4 sm:px-0">
            <div className="flex items-center">
                {MILESTONES.map((milestone, index) => {
                    const isCompleted = index < currentIndex;
                    const isCurrent = index === currentIndex;
                    const isFuture = index > currentIndex;

                    let statusClass = 'bg-gray-300 dark:bg-gray-600'; // Future
                    if (isCompleted) statusClass = 'bg-green-500';
                    if (isCurrent) statusClass = 'bg-primary-600 ring-4 ring-primary-200 dark:ring-primary-900';
                    if (isDeclined) statusClass = 'bg-red-500';
                    
                    return (
                        <React.Fragment key={milestone.status}>
                            <div className="flex flex-col items-center">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white transition-all duration-300 ${statusClass}`}>
                                    <Icon name={milestone.icon} className="w-4 h-4" />
                                </div>
                                <p className={`mt-2 text-xs text-center font-medium ${isCurrent || isCompleted || isDeclined ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'}`}>
                                    {milestone.label}
                                </p>
                            </div>
                            {index < MILESTONES.length - 1 && (
                                <div className={`flex-1 h-1 mx-2 transition-colors duration-300 ${isCompleted || isDeclined ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
            {isDeclined && (
                <div className="text-center mt-2 p-2 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded-md text-sm font-semibold">
                    Application Declined
                </div>
            )}
        </div>
    );
};
