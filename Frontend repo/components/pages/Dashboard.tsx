
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LabelList } from 'recharts';
import { Card } from '../common/Card';
import { Icon, IconName } from '../common/Icon';
import { Button } from '../common/Button';
import { crmService } from '../../services/crmService';
import type { Application, BankRates, Advisor } from '../../types';
import { ApplicationStatus } from '../../types';


interface DashboardProps {
  setCurrentView: (view: string) => void;
  navigateToClient: (clientId: string) => void;
  advisor: Advisor;
}

const chartData = [
  { name: 'Jan', applications: 4 }, { name: 'Feb', applications: 3 }, { name: 'Mar', applications: 5 },
  { name: 'Apr', applications: 4 }, { name: 'May', applications: 6 }, { name: 'Jun', applications: 7 },
  { name: 'Jul', applications: 5 }, { name: 'Aug', applications: 8 }, { name: 'Sep', applications: 6 },
  { name: 'Oct', applications: 9 }, { name: 'Nov', applications: 7 }, { name: 'Dec', applications: 10 },
];

const StatCard: React.FC<{ icon: any; title: string; value: string; change: string; changeType: 'increase' | 'decrease' }> = ({ icon, title, value, change, changeType }) => (
  <Card>
    <div className="flex items-center">
      <div className={`p-3 rounded-full ${changeType === 'increase' ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'}`}>
        <Icon name={icon} className={`h-6 w-6 ${changeType === 'increase' ? 'text-green-600' : 'text-red-600'}`} />
      </div>
      <div className="ml-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      </div>
    </div>
    <p className={`mt-2 text-xs ${changeType === 'increase' ? 'text-green-600' : 'text-red-600'}`}>
      {change} vs last month
    </p>
  </Card>
);

const ApplicationStatusBadge: React.FC<{ status: ApplicationStatus }> = ({ status }) => {
  const statusClasses = {
    [ApplicationStatus.Draft]: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    [ApplicationStatus.ApplicationSubmitted]: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    [ApplicationStatus.ConditionalApproval]: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    [ApplicationStatus.UnconditionalApproval]: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
    [ApplicationStatus.Settled]: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    [ApplicationStatus.Declined]: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };
  return <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusClasses[status]}`}>{status}</span>;
};

const StatusDetailBadge: React.FC<{ status: 'Active' | 'Needs Attention' | 'On Hold' }> = ({ status }) => {
    const statusClasses = {
        'Active': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
        'Needs Attention': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
        'On Hold': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    };
    const dotClasses = {
        'Active': 'bg-green-500',
        'Needs Attention': 'bg-yellow-500',
        'On Hold': 'bg-gray-500',
    };
    return (
        <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${statusClasses[status]}`}>
            <span className={`w-2 h-2 mr-1.5 rounded-full ${dotClasses[status]}`}></span>
            {status}
        </span>
    );
};

const RiskBadge: React.FC<{ risk: Application['riskLevel'] }> = ({ risk }) => {
    if (!risk) return null;
    const riskConfig: Record<NonNullable<Application['riskLevel']>, { icon: IconName, color: string, text: string }> = {
        'Low': { icon: 'ShieldCheck', color: 'text-green-500', text: 'Low risk of delay' },
        'Medium': { icon: 'ShieldAlert', color: 'text-yellow-500', text: 'Medium risk of delay' },
        'High': { icon: 'ShieldAlert', color: 'text-red-500', text: 'High risk of delay or decline' },
    };
    const config = riskConfig[risk];
    return (
        <div className="group relative flex items-center">
             <Icon name={config.icon} className={`h-5 w-5 ${config.color}`} />
             <span className="absolute left-1/2 -translate-x-1/2 -top-8 w-max px-2 py-1 bg-gray-700 text-white text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {config.text}
            </span>
        </div>
    );
};

const timeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
};

const WORKFLOW_COLORS = ['#3b82f6', '#f59e0b', '#10b981'];
const ADVISOR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1', '#ec4899', '#f97316'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{label}</p>
        <p className="text-sm text-primary-600 dark:text-primary-400">{`Applications Settled: ${payload[0].value}`}</p>
      </div>
    );
  }
  return null;
};


const Dashboard: React.FC<DashboardProps> = ({ setCurrentView, navigateToClient, advisor }) => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [interestRates, setInterestRates] = useState<BankRates[]>([]);
  const [isLoadingApplications, setIsLoadingApplications] = useState(true);
  const [isLoadingRates, setIsLoadingRates] = useState(true);
  const [filter, setFilter] = useState<'All' | 'Needs Attention' | 'On Hold' | 'Active'>('All');
  const [applicationView, setApplicationView] = useState<'my' | 'all'>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  
  const fetchRates = () => {
    setIsLoadingRates(true);
    crmService.getCurrentInterestRates().then(data => {
        setInterestRates(data);
        setIsLoadingRates(false);
    });
  }

  useEffect(() => {
    setIsLoadingApplications(true);
    setIsLoadingRates(true);

    const fetchApps = crmService.getApplications().then(data => {
        const openApplications = data.filter(app => 
            app.status !== ApplicationStatus.Settled && app.status !== ApplicationStatus.Declined
        );
        setApplications(openApplications);
    });

    const fetchInitialRates = crmService.getCurrentInterestRates().then(data => {
        setInterestRates(data);
    });

    Promise.all([fetchApps, fetchInitialRates]).finally(() => {
        setIsLoadingApplications(false);
        setIsLoadingRates(false);
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
            setIsFilterOpen(false);
        }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
        document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [filterRef]);


  const filteredApplications = useMemo(() => {
    let apps = applications;
    if (applicationView === 'my') {
      apps = apps.filter(app => app.advisorId === advisor.id);
    }
    if (filter === 'All') return apps;
    return apps.filter(app => app.status_detail === filter);
  }, [applications, filter, applicationView, advisor.id]);

  const APPS_PER_PAGE = 10;
  const indexOfLastApp = currentPage * APPS_PER_PAGE;
  const indexOfFirstApp = indexOfLastApp - APPS_PER_PAGE;
  const currentApplications = filteredApplications.slice(indexOfFirstApp, indexOfLastApp);
  const totalPages = Math.ceil(filteredApplications.length / APPS_PER_PAGE);

  const workflowChartData = useMemo(() => {
    if (!applications.length) return [];
    
    const stageCounts = applications.reduce((acc, app) => {
        if (app.status in acc) {
            acc[app.status]++;
        }
        return acc;
    }, {
        [ApplicationStatus.ApplicationSubmitted]: 0,
        [ApplicationStatus.ConditionalApproval]: 0,
        [ApplicationStatus.UnconditionalApproval]: 0,
    });

    return Object.entries(stageCounts).map(([name, value]) => ({ name, value }));
  }, [applications]);

  const advisorLoanData = useMemo(() => {
    if (!applications.length) return [];
    
    const advisorCounts = applications.reduce<Record<string, number>>((acc, app) => {
        const advisorName = app.updatedByName;
        acc[advisorName] = (acc[advisorName] || 0) + 1;
        return acc;
    }, {});

    // FIX: Explicitly convert loans to a number to satisfy TypeScript's strict arithmetic operation rules, which can fail with complex type inferences.
    return Object.entries(advisorCounts).map(([name, loans]) => ({ name, loans: Number(loans) })).sort((a,b) => b.loans - a.loans);
  }, [applications]);

  const handleFilterChange = (newFilter: typeof filter) => {
    setFilter(newFilter);
    setIsFilterOpen(false);
    setCurrentPage(1);
  }
  
  const toggleButtonClasses = (isActive: boolean) => 
    `inline-flex items-center px-3 py-1.5 text-xs font-medium focus:z-10 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors ${
        isActive
        ? 'bg-primary-600 text-white'
        : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
    }`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard icon="Users" title="New Leads" value="32" change="+12.5%" changeType="increase" />
        <StatCard icon="Banknote" title="Loans Settled" value="$1.2M" change="+5.2%" changeType="increase" />
        <StatCard icon="Briefcase" title="Active Applications" value={applications.length.toString()} change="-2.1%" changeType="decrease" />
        <StatCard icon="CheckSquare" title="Tasks Due" value="8" change="+10.0%" changeType="increase" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <h3 className="text-lg font-semibold mb-4">Applications Settled This Year</h3>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 20, right: 10, left: -10, bottom: 5 }}>
                    <defs>
                        <linearGradient id="dealGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.4}/>
                        </linearGradient>
                    </defs>
                    <XAxis 
                        dataKey="name" 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fill: 'currentColor', fontSize: 12 }} 
                    />
                    <YAxis 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fill: 'currentColor', fontSize: 12 }}
                    />
                    <Tooltip 
                        content={<CustomTooltip />} 
                        cursor={{ fill: 'rgba(128, 128, 128, 0.1)' }} 
                    />
                    <Bar 
                        dataKey="applications" 
                        fill="url(#dealGradient)" 
                        name="Applications Settled" 
                        radius={[10, 10, 0, 0]} 
                    />
                </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
            <h3 className="text-lg font-semibold mb-4">Work Flow Stage</h3>
            <div style={{ width: '100%', height: 300 }}>
             {isLoadingApplications ? (
                 <div className="flex justify-center items-center h-full">
                    <Icon name="Loader" className="h-8 w-8 animate-spin text-primary-500" />
                </div>
             ) : workflowChartData.every(d => d.value === 0) ? (
                <div className="flex justify-center items-center h-full text-sm text-gray-500 dark:text-gray-400">
                    No active applications to display.
                </div>
             ) : (
                <ResponsiveContainer>
                    <PieChart>
                        <Pie
                            data={workflowChartData}
                            cx="40%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            fill="#8884d8"
                            paddingAngle={5}
                            dataKey="value"
                            nameKey="name"
                        >
                            {workflowChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={WORKFLOW_COLORS[index % WORKFLOW_COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={{ 
                                backgroundColor: 'rgba(31, 41, 55, 0.8)', 
                                borderColor: 'rgba(128, 128, 128, 0.5)' 
                            }}
                            labelStyle={{ color: '#fff' }}
                        />
                        <Legend 
                            iconSize={10} 
                            wrapperStyle={{fontSize: '12px'}} 
                            layout="vertical"
                            verticalAlign="middle"
                            align="right"
                        />
                    </PieChart>
                </ResponsiveContainer>
             )}
            </div>
        </Card>
        
        <Card>
            <h3 className="text-lg font-semibold mb-4">Active Loans by Advisor</h3>
            <div style={{ width: '100%', height: 300 }}>
                {isLoadingApplications ? (
                    <div className="flex justify-center items-center h-full">
                        <Icon name="Loader" className="h-8 w-8 animate-spin text-primary-500" />
                    </div>
                ) : advisorLoanData.length === 0 ? (
                    <div className="flex justify-center items-center h-full text-sm text-gray-500 dark:text-gray-400">
                        No active loans to display.
                    </div>
                ) : (
                    <ResponsiveContainer>
                        <BarChart data={advisorLoanData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                            <XAxis type="number" hide />
                            <YAxis 
                                type="category" 
                                dataKey="name" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: 'currentColor', fontSize: 11 }} 
                                width={95}
                                interval={0}
                            />
                            <Tooltip 
                                cursor={{ fill: 'rgba(128, 128, 128, 0.1)' }}
                                contentStyle={{ 
                                    backgroundColor: 'rgba(31, 41, 55, 0.8)', 
                                    borderColor: 'rgba(128, 128, 128, 0.5)' 
                                }}
                                labelStyle={{ color: '#fff' }}
                            />
                            <Bar dataKey="loans" name="Active Loans" barSize={20} radius={[0, 5, 5, 0]}>
                                {advisorLoanData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={ADVISOR_COLORS[index % ADVISOR_COLORS.length]} />
                                ))}
                                 <LabelList dataKey="loans" position="right" offset={5} style={{ fill: 'currentColor', fontSize: 12 }} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>
        </Card>

        <Card className="lg:col-span-3">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold flex items-center">
                    <Icon name="Percent" className="h-5 w-5 mr-2 text-primary-500" />
                    Current Interest Rates
                </h3>
                <Button variant="ghost" size="sm" onClick={fetchRates} isLoading={isLoadingRates} leftIcon="RefreshCw">
                    Refresh
                </Button>
            </div>
            {isLoadingRates ? (
                <div className="flex justify-center items-center h-24">
                    <Icon name="Loader" className="h-6 w-6 animate-spin text-primary-500" />
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                            <tr>
                                <th scope="col" className="px-4 py-2">Lender</th>
                                {interestRates[0]?.rates.map(rate => (
                                    <th key={rate.term} scope="col" className="px-4 py-2 text-center">{rate.term}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {interestRates.map(bank => (
                                <tr key={bank.lender} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 last:border-b-0">
                                    <td className="px-4 py-2 font-semibold text-gray-900 dark:text-white">{bank.lender}</td>
                                    {bank.rates.map(rate => (
                                        <td key={rate.term} className="px-4 py-2 text-center">{rate.rate.toFixed(2)}%</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>

        <Card className="lg:col-span-3">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-4">
                <h3 className="text-lg font-semibold">Mortgages</h3>
                <div className="inline-flex rounded-md shadow-sm border border-gray-200 dark:border-gray-600">
                    <button onClick={() => setApplicationView('my')} className={`${toggleButtonClasses(applicationView === 'my')} rounded-l-md`}>
                        My Applications
                    </button>
                    <button onClick={() => setApplicationView('all')} className={`${toggleButtonClasses(applicationView === 'all')} -ml-px rounded-r-md`}>
                        All Applications
                    </button>
                </div>
            </div>
             <div className="relative" ref={filterRef}>
                <Button variant="secondary" size="sm" leftIcon="Filter" onClick={() => setIsFilterOpen(!isFilterOpen)}>
                    Filter: {filter}
                </Button>
                {isFilterOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg z-10 border dark:border-gray-700">
                        <a href="#" onClick={(e) => {e.preventDefault(); handleFilterChange('All')}} className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">All</a>
                        <a href="#" onClick={(e) => {e.preventDefault(); handleFilterChange('Active')}} className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">Active</a>
                        <a href="#" onClick={(e) => {e.preventDefault(); handleFilterChange('Needs Attention')}} className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">Needs Attention</a>
                        <a href="#" onClick={(e) => {e.preventDefault(); handleFilterChange('On Hold')}} className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">On Hold</a>
                    </div>
                )}
             </div>
          </div>
          <div className="overflow-x-auto">
            {isLoadingApplications ? (
                 <div className="flex justify-center items-center h-48">
                    <Icon name="Loader" className="h-8 w-8 animate-spin text-primary-500" />
                </div>
            ) : (
                <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                        <tr>
                            <th scope="col" className="px-6 py-3">Reference Number</th>
                            <th scope="col" className="px-6 py-3">Customer Name</th>
                            <th scope="col" className="px-6 py-3">Workflow Stage</th>
                            <th scope="col" className="px-6 py-3">Status</th>
                            <th scope="col" className="px-6 py-3">Last Updated</th>
                            <th scope="col" className="px-6 py-3">Updated By</th>
                            <th scope="col" className="px-6 py-3">Risk</th>
                        </tr>
                    </thead>
                    <tbody>
                        {currentApplications.map(app => (
                            <tr key={app.id} onClick={() => navigateToClient(app.clientId)} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer">
                                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white whitespace-nowrap">{app.referenceNumber}</td>
                                <td className="px-6 py-4">{app.clientName}</td>
                                <td className="px-6 py-4"><ApplicationStatusBadge status={app.status} /></td>
                                <td className="px-6 py-4"><StatusDetailBadge status={app.status_detail} /></td>
                                <td className="px-6 py-4">{timeAgo(app.lastUpdated)}</td>
                                <td className="px-6 py-4">{app.updatedByName}</td>
                                <td className="px-6 py-4"><RiskBadge risk={app.riskLevel} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
          </div>
          {!isLoadingApplications && filteredApplications.length > APPS_PER_PAGE && (
            <div className="flex justify-between items-center pt-4 border-t dark:border-gray-700 mt-4">
                <span className="text-sm text-gray-700 dark:text-gray-400">
                    Showing {indexOfFirstApp + 1} to {Math.min(indexOfLastApp, filteredApplications.length)} of {filteredApplications.length} entries
                </span>
                <div className="inline-flex -space-x-px">
                    <Button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        variant="secondary"
                        size="sm"
                        className="rounded-r-none"
                    >
                        Previous
                    </Button>
                    <Button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        variant="secondary"
                        size="sm"
                        className="rounded-l-none"
                    >
                        Next
                    </Button>
                </div>
            </div>
           )}
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
