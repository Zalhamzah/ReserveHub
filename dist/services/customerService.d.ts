import { Customer, VipStatus } from '@prisma/client';
export interface CreateCustomerData {
    email?: string;
    phone?: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: Date;
    preferences?: any;
    tags?: string[];
    vipStatus?: VipStatus;
    notes?: string;
    businessId: string;
}
export interface UpdateCustomerData {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    dateOfBirth?: Date;
    preferences?: any;
    tags?: string[];
    vipStatus?: VipStatus;
    notes?: string;
    isActive?: boolean;
}
export interface CustomerSearchFilters {
    businessId: string;
    search?: string;
    email?: string;
    phone?: string;
    vipStatus?: VipStatus;
    tags?: string[];
    isActive?: boolean;
    minTotalSpent?: number;
    maxTotalSpent?: number;
    minTotalVisits?: number;
    maxTotalVisits?: number;
    lastVisitAfter?: Date;
    lastVisitBefore?: Date;
}
export interface CustomerStats {
    totalCustomers: number;
    activeCustomers: number;
    vipCustomers: number;
    averageSpent: number;
    averageVisits: number;
    newCustomersThisMonth: number;
    returningCustomers: number;
}
export declare class CustomerService {
    createCustomer(data: CreateCustomerData): Promise<Customer>;
    getCustomerById(customerId: string, businessId: string): Promise<Customer>;
    updateCustomer(customerId: string, businessId: string, data: UpdateCustomerData): Promise<Customer>;
    deleteCustomer(customerId: string, businessId: string): Promise<void>;
    searchCustomers(filters: CustomerSearchFilters, page?: number, limit?: number): Promise<{
        customers: Customer[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    getCustomerStats(businessId: string): Promise<CustomerStats>;
    updateCustomerVisitStats(customerId: string, amount: number): Promise<void>;
    getCustomersByTag(businessId: string, tag: string): Promise<Customer[]>;
    addCustomerTag(customerId: string, businessId: string, tag: string): Promise<Customer>;
    removeCustomerTag(customerId: string, businessId: string, tag: string): Promise<Customer>;
}
export declare const customerService: CustomerService;
//# sourceMappingURL=customerService.d.ts.map