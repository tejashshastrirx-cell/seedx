import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Outlet, ScrollRestoration } from 'react-router'
import { Layout } from '@/components/Layout'
import { PageLoader } from '@/components/ui'
import { RequireAdmin, RequireAuth, RequireRole } from './guards'
import { AboutPage, HelpPage, HomePage, HowItWorksPage, NotFoundPage } from '@/features/public/PublicPages'
import { AuthCallbackPage, ForgotPasswordPage, LoginPage, ResetPasswordPage, SignupPage, VerifyEmailPage } from '@/features/auth/AuthPages'

// Route-level code splitting keeps the first load small on mid-range phones.
const L = <T extends Record<string, unknown>>(f: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await f())[name] as React.ComponentType }))
const Marketplace = L(() => import('@/features/marketplace/Marketplace'), 'MarketplacePage')
const ListingDetail = L(() => import('@/features/marketplace/Marketplace'), 'ListingDetailPage')
const FarmerOverview = L(() => import('@/features/farmer/Farmer'), 'FarmerOverviewPage')
const HarvestList = L(() => import('@/features/farmer/Farmer'), 'HarvestListPage')
const HarvestForm = L(() => import('@/features/farmer/Farmer'), 'HarvestFormPage')
const FarmerOffers = L(() => import('@/features/farmer/Farmer'), 'FarmerOffersPage')
const FarmerEarnings = L(() => import('@/features/farmer/Farmer'), 'FarmerEarningsPage')
const BuyerOverview = L(() => import('@/features/buyer/Buyer'), 'BuyerOverviewPage')
const Requirements = L(() => import('@/features/buyer/Buyer'), 'RequirementsPage')
const Purchases = L(() => import('@/features/buyer/Buyer'), 'PurchasesPage')
const Matching = L(() => import('@/features/buyer/Buyer'), 'MatchingPage')
const Orders = L(() => import('@/features/orders/Orders'), 'OrdersPage')
const OrderDetail = L(() => import('@/features/orders/Orders'), 'OrderDetailPage')
const Logistics = L(() => import('@/features/orders/Orders'), 'LogisticsPage')
const Notifications = L(() => import('@/features/notifications/Notifications'), 'NotificationsPage')
const Seeds = L(() => import('@/features/seeds/Seeds'), 'SeedsPage')
const SeedDetail = L(() => import('@/features/seeds/Seeds'), 'SeedDetailPage')
const SeedOrders = L(() => import('@/features/seeds/Seeds'), 'SeedOrdersPage')
const SeedManage = L(() => import('@/features/seeds/Seeds'), 'SeedManagePage')
const Prices = lazy(async () => ({ default: (await import('@/features/prices/Prices')).PricesPage }))
const PricesExplorer = lazy(async () => { const m = await import('@/features/prices/Prices'); return { default: () => <m.PricesPage explorer /> } })
const Schemes = lazy(async () => ({ default: (await import('@/features/account/Account')).SchemesPage }))
const SavedSchemes = lazy(async () => { const m = await import('@/features/account/Account'); return { default: () => <m.SchemesPage savedOnly /> } })
const SchemeDetail = L(() => import('@/features/account/Account'), 'SchemeDetailPage')
const Land = L(() => import('@/features/account/Account'), 'LandPage')
const Dashboard = L(() => import('@/features/account/Account'), 'DashboardPage')
const Profile = L(() => import('@/features/account/Account'), 'ProfilePage')
const Settings = L(() => import('@/features/account/Account'), 'SettingsPage')
const AdminOverview = L(() => import('@/features/admin/Admin'), 'AdminOverviewPage')
const AdminUsers = L(() => import('@/features/admin/Admin'), 'AdminUsersPage')
const AdminListings = L(() => import('@/features/admin/Admin'), 'AdminListingsPage')
const AdminOrders = L(() => import('@/features/admin/Admin'), 'AdminOrdersPage')
const AdminSeeds = L(() => import('@/features/admin/Admin'), 'AdminSeedsPage')
const AdminSchemes = L(() => import('@/features/admin/Admin'), 'AdminSchemesPage')
const AdminReports = L(() => import('@/features/admin/Admin'), 'AdminReportsPage')
const AdminAudit = L(() => import('@/features/admin/Admin'), 'AdminAuditPage')
const Clients = L(() => import('@/features/network/Network'), 'ClientsPage')
const Suppliers = L(() => import('@/features/network/Network'), 'SuppliersPage')
const AdminCatalogue = L(() => import('@/features/admin/Catalogue'), 'AdminCataloguePage')

const S = (el: ReactNode) => <Suspense fallback={<PageLoader />}>{el}</Suspense>
const auth = (el: ReactNode) => <RequireAuth>{S(el)}</RequireAuth>
const role = (r: string, el: ReactNode) => <RequireAuth><RequireRole role={r}>{S(el)}</RequireRole></RequireAuth>
const admin = (el: ReactNode) => <RequireAuth><RequireAdmin>{S(el)}</RequireAdmin></RequireAuth>

function Root() {
  return <><ScrollRestoration /><Outlet /></>
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [{
      element: <Layout />,
      children: [
        { path: '/', element: <HomePage /> },
        { path: '/about', element: <AboutPage /> },
        { path: '/how-it-works', element: <HowItWorksPage /> },
        { path: '/help', element: <HelpPage /> },
        { path: '/marketplace', element: S(<Marketplace />) },
        { path: '/marketplace/:id', element: S(<ListingDetail />) },
        { path: '/prices', element: S(<Prices />) },
        { path: '/prices/explorer', element: S(<PricesExplorer />) },
        { path: '/seeds', element: S(<Seeds />) },
        { path: '/seeds/orders', element: auth(<SeedOrders />) },
        { path: '/seeds/manage', element: role('seed_seller', <SeedManage />) },
        { path: '/seeds/:id', element: S(<SeedDetail />) },
        { path: '/schemes', element: S(<Schemes />) },
        { path: '/schemes/saved', element: auth(<SavedSchemes />) },
        { path: '/schemes/:slug', element: S(<SchemeDetail />) },
        { path: '/login', element: <LoginPage /> },
        { path: '/signup', element: <SignupPage /> },
        { path: '/verify-email', element: <VerifyEmailPage /> },
        { path: '/forgot-password', element: <ForgotPasswordPage /> },
        { path: '/reset-password', element: <ResetPasswordPage /> },
        { path: '/auth/callback', element: <AuthCallbackPage /> },
        { path: '/dashboard', element: auth(<Dashboard />) },
        { path: '/farmer', element: role('farmer', <FarmerOverview />) },
        { path: '/farmer/harvest', element: role('farmer', <HarvestList />) },
        { path: '/farmer/harvest/new', element: role('farmer', <HarvestForm />) },
        { path: '/farmer/harvest/:id/edit', element: role('farmer', <HarvestForm />) },
        { path: '/farmer/offers', element: role('farmer', <FarmerOffers />) },
        { path: '/farmer/earnings', element: role('farmer', <FarmerEarnings />) },
        { path: '/farmer/clients', element: role('farmer', <Clients />) },
        { path: '/buyer', element: role('buyer', <BuyerOverview />) },
        { path: '/buyer/requirements', element: role('buyer', <Requirements />) },
        { path: '/buyer/purchases', element: role('buyer', <Purchases />) },
        { path: '/buyer/suppliers', element: role('buyer', <Suppliers />) },
        { path: '/matching', element: auth(<Matching />) },
        { path: '/logistics', element: role('logistics', <Logistics />) },
        { path: '/orders', element: auth(<Orders />) },
        { path: '/orders/:id', element: auth(<OrderDetail />) },
        { path: '/landowner', element: auth(<Land />) },
        { path: '/landowner/listings', element: auth(<Land />) },
        { path: '/profile', element: auth(<Profile />) },
        { path: '/notifications', element: auth(<Notifications />) },
        { path: '/settings', element: auth(<Settings />) },
        { path: '/admin', element: admin(<AdminOverview />) },
        { path: '/admin/users', element: admin(<AdminUsers />) },
        { path: '/admin/listings', element: admin(<AdminListings />) },
        { path: '/admin/orders', element: admin(<AdminOrders />) },
        { path: '/admin/seeds', element: admin(<AdminSeeds />) },
        { path: '/admin/schemes', element: admin(<AdminSchemes />) },
        { path: '/admin/reports', element: admin(<AdminReports />) },
        { path: '/admin/audit-logs', element: admin(<AdminAudit />) },
        { path: '/admin/catalogue', element: admin(<AdminCatalogue />) },
        { path: '*', element: <NotFoundPage /> },
      ],
    }],
  },
])
