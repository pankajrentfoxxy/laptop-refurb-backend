const axios = require('axios');

const buildFallback = (companyName) => ({
    summary: `Research unavailable for "${companyName}". Add details manually.`,
    industry: 'Unknown',
    employee_count: 'Unknown',
    headquarters: 'Unknown',
    website: '',
    founders: [],
    products: [],
    tech_stack: [],
    recent_news: [],
    potential_needs: 'Unknown'
});

const buildLeadFallback = (companyName) => ({
    industry: 'Unknown',
    pincode: 'Unknown',
    cin: 'Unknown',
    entity_type: 'Unknown',
    roc: 'Unknown',
    revenue: 'Unknown',
    employees: 'Unknown',
    gst: 'Unknown',
    address: 'Unknown',
    city: 'Unknown',
    state: 'Unknown',
    departments: [],
    website: '',
    linkedin_url: '',
    facebook_url: '',
    twitter_url: '',
    technologies: [],
    annual_revenue: 'Unknown',
    total_funding: 'Unknown',
    latest_funding: 'Unknown',
    latest_funding_amount: 'Unknown',
    subsidiary_of: 'Unknown',
    summary: `Research unavailable for "${companyName}". Add details manually.`
});

const researchCompany = async (companyName) => {
    if (!companyName) throw new Error('Company name is required');
    if (!process.env.PERPLEXITY_API_KEY) {
        return buildFallback(companyName);
    }

    try {
        const response = await axios.post(
            'https://api.perplexity.ai/chat/completions',
            {
                model: 'sonar',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an advanced business intelligence analyst. Provide comprehensive research on companies.'
                    },
                    {
                        role: 'user',
                        content: `Research the company "${companyName}". provide details.`
                    }
                ],
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        schema: {
                            type: 'object',
                            properties: {
                                summary: { type: 'string' },
                                industry: { type: 'string' },
                                employee_count: { type: 'string' },
                                headquarters: { type: 'string' },
                                website: { type: 'string' },
                                founders: { type: 'array', items: { type: 'string' } },
                                products: { type: 'array', items: { type: 'string' } },
                                tech_stack: { type: 'array', items: { type: 'string' } },
                                recent_news: { type: 'array', items: { type: 'string' } },
                                potential_needs: { type: 'string' }
                            },
                            required: ['summary', 'industry', 'employee_count', 'headquarters', 'potential_needs']
                        }
                    }
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Parse content
        // With structured output, content is guaranteed JSON string
        return JSON.parse(response.data.choices[0].message.content);
    } catch (error) {
        console.error('Perplexity API Error:', error.response?.data || error.message);
        return buildFallback(companyName);
    }
};

const researchLeadCompany = async (companyName) => {
    if (!companyName) throw new Error('Company name is required');
    if (!process.env.PERPLEXITY_API_KEY) {
        return buildLeadFallback(companyName);
    }

    try {
        const response = await axios.post(
            'https://api.perplexity.ai/chat/completions',
            {
                model: 'sonar',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a business analyst. Return accurate, best-effort structured company details from publicly available sources.'
                    },
                    {
                        role: 'user',
                        content: `Research the company "${companyName}".
Use this source priority:
1) Official website and legal/company filings
2) Official LinkedIn company page
3) Trusted business databases and major publications

Return a single JSON object with these keys:
- industry
- pincode
- cin
- entity_type
- roc
- revenue
- employees
- gst
- address
- city
- state
- departments (array)
- website
- linkedin_url
- facebook_url
- twitter_url
- technologies (array)
- annual_revenue
- total_funding
- latest_funding
- latest_funding_amount
- subsidiary_of
- summary

Rules:
- Provide best available value; use "Unknown" only when truly unavailable.
- Keep URLs absolute.
- Do not return markdown or explanation, only valid JSON.`
                    }
                ],
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        schema: {
                            type: 'object',
                            properties: {
                                industry: { type: 'string' },
                                pincode: { type: 'string' },
                                cin: { type: 'string' },
                                entity_type: { type: 'string' },
                                roc: { type: 'string' },
                                revenue: { type: 'string' },
                                employees: { type: 'string' },
                                gst: { type: 'string' },
                                address: { type: 'string' },
                                city: { type: 'string' },
                                state: { type: 'string' },
                                departments: { type: 'array', items: { type: 'string' } },
                                website: { type: 'string' },
                                linkedin_url: { type: 'string' },
                                facebook_url: { type: 'string' },
                                twitter_url: { type: 'string' },
                                technologies: { type: 'array', items: { type: 'string' } },
                                annual_revenue: { type: 'string' },
                                total_funding: { type: 'string' },
                                latest_funding: { type: 'string' },
                                latest_funding_amount: { type: 'string' },
                                subsidiary_of: { type: 'string' },
                                summary: { type: 'string' }
                            },
                            required: ['industry', 'pincode', 'cin', 'entity_type', 'roc', 'revenue', 'employees', 'gst', 'address', 'city', 'state']
                        }
                    }
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return JSON.parse(response.data.choices[0].message.content);
    } catch (error) {
        console.error('Perplexity API Error:', error.response?.data || error.message);
        return buildLeadFallback(companyName);
    }
};

module.exports = { researchCompany, researchLeadCompany };
