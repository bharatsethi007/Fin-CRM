import React, { useState } from 'react';
import type { Advisor } from '../../types';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';

interface ProfileSettingsProps {
    advisor: Advisor;
}

export const ProfileSettings: React.FC<ProfileSettingsProps> = ({ advisor }) => {
    const [formState, setFormState] = useState({
        firstName: advisor.name.split(' ')[0],
        lastName: advisor.name.split(' ').slice(1).join(' '),
        preferredTimezone: advisor.preferredTimezone || 'UTC',
        startWeekOn: advisor.startWeekOn || 'Monday',
    });

    const getInitials = (name: string) => {
        const names = name.split(' ');
        if (names.length === 0) return '?';
        const firstInitial = names[0][0];
        const lastInitial = names.length > 1 ? names[names.length - 1][0] : '';
        return `${firstInitial}${lastInitial}`.toUpperCase();
    }

    const inputClasses = "block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2";

    return (
        <div className="max-w-4xl">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Profile</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage your personal details</p>

            <div className="mt-6 p-4 rounded-lg bg-gray-100 dark:bg-gray-700/50 flex items-center">
                <Icon name="Info" className="h-5 w-5 text-gray-500 dark:text-gray-400 mr-3" />
                <p className="text-sm text-gray-700 dark:text-gray-300">Changes to your profile will apply to all of your workspaces.</p>
            </div>
            
            <div className="mt-8 space-y-8 divide-y divide-gray-200 dark:divide-gray-700">
                {/* Profile Picture Section */}
                <div className="pt-8">
                     <div>
                        <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">Profile Picture</h3>
                    </div>
                    <div className="mt-6 flex items-center">
                        <div className="h-20 w-20 rounded-full bg-orange-500 flex items-center justify-center text-white text-3xl font-bold flex-shrink-0">
                            {getInitials(advisor.name)}
                        </div>
                        <div className="ml-5">
                            <p className="text-sm text-gray-500 dark:text-gray-400">We only support PNGs, JPEGs and GIFs under 10MB</p>
                            <Button leftIcon="Download" className="mt-2">Upload Image</Button>
                        </div>
                    </div>
                </div>

                {/* Personal Details Section */}
                <div className="pt-8">
                    <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                        <div className="sm:col-span-3">
                            <label htmlFor="first-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                First Name
                            </label>
                            <div className="mt-1">
                                <input type="text" name="first-name" id="first-name" defaultValue={formState.firstName} className={inputClasses} />
                            </div>
                        </div>

                        <div className="sm:col-span-3">
                            <label htmlFor="last-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Last Name
                            </label>
                            <div className="mt-1">
                                <input type="text" name="last-name" id="last-name" defaultValue={formState.lastName} className={inputClasses} />
                            </div>
                        </div>

                        <div className="sm:col-span-4">
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Primary Email Address
                            </label>
                            <div className="mt-1 flex items-center">
                                <input id="email" name="email" type="email" defaultValue={advisor.email} readOnly className={`${inputClasses} flex-grow !bg-gray-100 dark:!bg-gray-800`} />
                                <Button variant="secondary" className="ml-3 flex-shrink-0">Edit</Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Time Preferences Section */}
                <div className="pt-8">
                     <div>
                        <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">Time preferences</h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage your time preferences</p>
                    </div>
                    <div className="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                        <div className="sm:col-span-3">
                            <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Preferred Timezone
                            </label>
                            <div className="mt-1">
                                <select id="timezone" name="timezone" defaultValue={formState.preferredTimezone} className={inputClasses}>
                                    <option>UTC</option>
                                    <option>Pacific/Auckland (GMT+12)</option>
                                    <option>Australia/Sydney (GMT+10)</option>
                                </select>
                            </div>
                        </div>
                        <div className="sm:col-span-3">
                            <label htmlFor="week-start" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Start week on
                            </label>
                            <div className="mt-1">
                                <select id="week-start" name="week-start" defaultValue={formState.startWeekOn} className={inputClasses}>
                                    <option>Monday</option>
                                    <option>Sunday</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};