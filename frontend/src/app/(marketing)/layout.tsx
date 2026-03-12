import { Footer } from '@/components/marketing/Footer';
import { SiteHeader } from '@/components/marketing/site-header';
import { getUserDetails } from '@/app/dashboard/actions';
import { I18nProviderWrapper } from '@/components/i18n-provider-wrapper';
import { getI18nSettings } from '@/lib/i18n/settings';
import { loadTranslations } from '@/lib/i18n/actions';

export default async function SiteLayout(props: React.PropsWithChildren) {
    const user = await getUserDetails();
    const settings = getI18nSettings();
    const language = settings.lng || 'en';

    const namespaces = ['common', 'marketing', 'auth', 'account'];
    const resources = await Promise.all(
        namespaces.map(async (ns) => {
            const translations = await loadTranslations(language, ns);
            return { [ns]: translations };
        })
    ).then((results) => Object.assign({}, ...results));

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'TaskClaw',
        applicationCategory: 'ProjectManagement',
        operatingSystem: 'Web, Docker, Self-hosted',
        description:
            'Open-source AI task orchestration platform. Sync Notion, ClickUp, and more into one Kanban board. Let AI execute your tasks on your own infrastructure.',
        offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
        },
        license: 'https://opensource.org/licenses/MIT',
    };

    return (
        <I18nProviderWrapper resources={resources}>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <div className="flex min-h-[100vh] flex-col bg-gradient-to-b from-background to-background/95 dark:from-background dark:to-background/95 relative">
                {/* Subtle background glow */}
                <div className="absolute top-0 left-0 right-0 h-[500px] bg-hero-glow opacity-30 -z-10"></div>

                <SiteHeader user={user} />

                {props.children}

                <Footer />
            </div>
        </I18nProviderWrapper>
    );
}
