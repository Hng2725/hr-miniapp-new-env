import { useState, useEffect } from 'react';
import { PrivosAppProvider, usePrivosContext, usePrivosApp } from '@privos_ai/app-react';
import { ThemeProvider, ThemeToggle } from './theme-provider';
import CompanyHome from './company-home';
import RecruitmentPanel from './recruitment-panel';
import PipelineDashboard from './pipeline-dashboard';
import LifecycleDashboard from './lifecycle/LifecycleDashboard';
import PayrollTab from './payroll/PayrollTab';
import BotDraftingTab from './bot-drafting-tab';
import CVScoredTab from './cv-scored/CVScoredTab';
import JDChatbotTab from './jd-chatbot-functional';
import EmailTab from './email-history/EmailTab';
import { createInterviewEmailTemplateRepository } from './email-templates/interview-email-template-default';
import { ensureTemplatesExistGlobal } from './pipeline-service';
import { usePayrollAccessPolling } from './payroll/access/usePayrollAccessPolling';
import {
  canSelectPayrollTab,
  filterPayrollTab,
  removePayrollFromVisited,
  resolveTabAfterPayrollRevocation,
} from './payroll/access/payroll-navigation-policy';

type Tab = 'home' | 'email' | 'recruitment' | 'pipeline' | 'cvScored' | 'chatbotJD' | 'lifecycle' | 'payroll' | 'botDrafting';
type SectionId = 'hr' | 'admin';

type TabSection = {
  id: SectionId;
  label: string;
  tabs: { id: Tab; label: string }[];
};

const TAB_SECTIONS: TabSection[] = [
  {
    id: 'hr',
    label: 'HR',
    tabs: [
      { id: 'recruitment', label: 'Tuy\u1ec3n d\u1ee5ng' },
      { id: 'pipeline', label: 'CV Pipeline' },
      { id: 'cvScored', label: 'CV \u0111\u00e3 ch\u1ea5m' },
      { id: 'chatbotJD', label: 'Chỉnh sửa JD' },
    ],
  },
  {
    id: 'admin',
    label: 'H\u00e0nh ch\u00ednh',
    tabs: [
      { id: 'lifecycle', label: 'H\u1ed3 s\u01a1 NS' },
      { id: 'payroll', label: 'Qu\u1ea3n l\u00fd L\u01b0\u01a1ng' },
      { id: 'botDrafting', label: 'Bot so\u1ea1n th\u1ea3o' },
    ],
  },
];

function ThemedApp() {
  const app = usePrivosApp();
  const { theme, roomId, userRoles } = usePrivosContext();
  const [tab, setTab] = useState<Tab>('home');
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(() => new Set<Tab>(['home']));
  const [openSection, setOpenSection] = useState<SectionId | null>(null);
  const canAccessPayroll = usePayrollAccessPolling(app, userRoles);
  const payrollAccessRoles = canAccessPayroll ? ['owner'] : [];
  const visibleTabSections = TAB_SECTIONS.map((section) => ({
    ...section,
    tabs: filterPayrollTab(section.tabs, payrollAccessRoles),
  }));

  useEffect(() => {
    if (app && roomId) {
      ensureTemplatesExistGlobal(app, roomId, true).catch(console.error);
    }
  }, [app, roomId]);

  useEffect(() => {
    if (!app || !roomId) return;
    const repository = createInterviewEmailTemplateRepository(app, roomId);
    repository.ensureInitialized().catch(error => {
      console.error('[InterviewEmailTemplates] Initialization failed', error);
    });
  }, [app, roomId]);

  useEffect(() => {
    if (tab === 'lifecycle') {
      console.log('[App] Lifecycle tab is active');
    }
  }, [tab]);

  useEffect(() => {
    if (canAccessPayroll) return;

    setTab((previousTab) => resolveTabAfterPayrollRevocation(previousTab));
    setVisitedTabs((previousVisitedTabs) => {
      if (!previousVisitedTabs.has('payroll')) return previousVisitedTabs;
      return removePayrollFromVisited(previousVisitedTabs);
    });
  }, [canAccessPayroll]);

  const handleSelectTab = (selectedTab: Tab) => {
    if (!canSelectPayrollTab(selectedTab, payrollAccessRoles)) return;

    setTab(selectedTab);
    setVisitedTabs((prev) => {
      if (prev.has(selectedTab)) return prev;
      const next = new Set(prev);
      next.add(selectedTab);
      return next;
    });
  };

  const isSectionActive = (section: TabSection) => section.tabs.some((t) => t.id === tab);

  return (
    <ThemeProvider hostTheme={theme}>
      <div className="app-header">
        <nav className="app-tabs" aria-label="Dashboard navigation" onMouseLeave={() => setOpenSection(null)}>
          <button
            type="button"
            className={`nav-primary-btn${tab === 'home' ? ' nav-primary-active' : ''}`}
            onClick={() => {
              handleSelectTab('home');
              setOpenSection(null);
            }}
          >
            Company
          </button>

          <button
            type="button"
            className={`nav-primary-btn${tab === 'email' ? ' nav-primary-active' : ''}`}
            onClick={() => {
              handleSelectTab('email');
              setOpenSection(null);
            }}
          >
            Email
          </button>

          {visibleTabSections.map((section) => {
            if (section.tabs.length === 0) return null;

            const isOpen = openSection === section.id;
            const isActive = isSectionActive(section);

            return (
              <div
                className={`app-nav-section${isOpen ? ' app-nav-section-open' : ''}`}
                key={section.id}
              >
                <button
                  type="button"
                  className={`nav-primary-btn${isOpen ? ' nav-primary-open' : ''}${isActive ? ' nav-primary-active' : ''}`}
                  aria-expanded={isOpen}
                  onClick={() => setOpenSection(isOpen ? null : section.id)}
                >
                  <span>{section.label}</span>
                  <span className="nav-primary-chevron" aria-hidden="true">{'\u203a'}</span>
                </button>

                <div className={`app-subnav${isOpen ? ' app-subnav-open' : ''}`} aria-hidden={!isOpen}>
                  {section.tabs.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`tab-btn${tab === t.id ? ' tab-active' : ''}`}
                      tabIndex={isOpen ? 0 : -1}
                      onClick={() => {
                        handleSelectTab(t.id);
                        setOpenSection(null);
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <ThemeToggle />
      </div>
      <div className={tab === 'home' ? 'app-tab-panel active' : 'app-tab-panel'} aria-hidden={tab !== 'home'}>
        <CompanyHome />
      </div>
      {visitedTabs.has('email') && (
        <div className={tab === 'email' ? 'app-tab-panel active' : 'app-tab-panel'} aria-hidden={tab !== 'email'}>
          <EmailTab active={tab === 'email'} />
        </div>
      )}
      {visitedTabs.has('recruitment') && (
        <div className={tab === 'recruitment' ? 'app-tab-panel active' : 'app-tab-panel'} aria-hidden={tab !== 'recruitment'}>
          <RecruitmentPanel />
        </div>
      )}

      {visitedTabs.has('pipeline') && (
        <div className={tab === 'pipeline' ? 'app-tab-panel active' : 'app-tab-panel'} aria-hidden={tab !== 'pipeline'}>
          <PipelineDashboard />
        </div>
      )}

      {visitedTabs.has('cvScored') && (
        <div className={tab === 'cvScored' ? 'app-tab-panel active' : 'app-tab-panel'} aria-hidden={tab !== 'cvScored'}>
          <CVScoredTab />
        </div>
      )}

      {visitedTabs.has('chatbotJD') && (
        <div className={tab === 'chatbotJD' ? 'app-tab-panel active' : 'app-tab-panel'} aria-hidden={tab !== 'chatbotJD'}>
          <JDChatbotTab />
        </div>
      )}



      {visitedTabs.has('lifecycle') && (
        <div className={tab === 'lifecycle' ? 'app-tab-panel active' : 'app-tab-panel'} aria-hidden={tab !== 'lifecycle'}>
          <LifecycleDashboard />
        </div>
      )}

      {canAccessPayroll && visitedTabs.has('payroll') && (
        <div className={tab === 'payroll' ? 'app-tab-panel active' : 'app-tab-panel'} aria-hidden={tab !== 'payroll'}>
          <PayrollTab key={roomId} roomId={roomId} userRoles={payrollAccessRoles} />
        </div>
      )}

      {visitedTabs.has('botDrafting') && (
        <div className={tab === 'botDrafting' ? 'app-tab-panel active' : 'app-tab-panel'} aria-hidden={tab !== 'botDrafting'}>
          <BotDraftingTab />
        </div>
      )}
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <PrivosAppProvider>
      <ThemedApp />
    </PrivosAppProvider>
  );
}
