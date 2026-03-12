'use server';

import { cookies } from 'next/headers';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function getAuthHeaders() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

async function getAuthToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get('auth_token')?.value;
}

async function getCurrentAccountId(): Promise<string | null> {
  const cookieStore = await cookies();
  const accountId = cookieStore.get('current_account_id')?.value;
  return accountId || null;
}

export async function getSkills(activeOnly?: boolean) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const url = activeOnly
      ? `${API_URL}/accounts/${accountId}/skills?active_only=true`
      : `${API_URL}/accounts/${accountId}/skills`;

    const response = await fetch(url, {
      headers: await getAuthHeaders(),
      cache: 'no-store',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch skills');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching skills:', error);
    throw error;
  }
}

export async function createSkill(data: {
  name: string;
  description?: string;
  instructions: string;
  is_active?: boolean;
}) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const response = await fetch(`${API_URL}/accounts/${accountId}/skills`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create skill');
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating skill:', error);
    throw error;
  }
}

export async function updateSkill(
  id: string,
  data: {
    name?: string;
    description?: string;
    instructions?: string;
    is_active?: boolean;
  },
) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const response = await fetch(`${API_URL}/accounts/${accountId}/skills/${id}`, {
      method: 'PATCH',
      headers: await getAuthHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update skill');
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating skill:', error);
    throw error;
  }
}

export async function deleteSkill(id: string) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const response = await fetch(`${API_URL}/accounts/${accountId}/skills/${id}`, {
      method: 'DELETE',
      headers: await getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete skill');
    }

    return await response.json();
  } catch (error) {
    console.error('Error deleting skill:', error);
    throw error;
  }
}

export async function getCategorySkillsMap(): Promise<Record<string, any[]>> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const response = await fetch(
      `${API_URL}/accounts/${accountId}/skills/category-map`,
      {
        headers: await getAuthHeaders(),
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch category skills map');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching category skills map:', error);
    return {};
  }
}

export async function getSkillsForCategory(categoryId: string) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const response = await fetch(
      `${API_URL}/accounts/${accountId}/skills/category/${categoryId}/default`,
      {
        headers: await getAuthHeaders(),
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch category skills');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching category skills:', error);
    throw error;
  }
}

export async function linkSkillToCategory(skillId: string, categoryId: string) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const response = await fetch(
      `${API_URL}/accounts/${accountId}/skills/${skillId}/link-category/${categoryId}`,
      {
        method: 'POST',
        headers: await getAuthHeaders(),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to link skill to category');
    }

    return await response.json();
  } catch (error) {
    console.error('Error linking skill to category:', error);
    throw error;
  }
}

export async function unlinkSkillFromCategory(skillId: string, categoryId: string) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const response = await fetch(
      `${API_URL}/accounts/${accountId}/skills/${skillId}/unlink-category/${categoryId}`,
      {
        method: 'DELETE',
        headers: await getAuthHeaders(),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to unlink skill from category');
    }

    return await response.json();
  } catch (error) {
    console.error('Error unlinking skill from category:', error);
    throw error;
  }
}

export async function uploadSkillAttachment(skillId: string, formData: FormData) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const token = await getAuthToken();
    const response = await fetch(
      `${API_URL}/accounts/${accountId}/skills/${skillId}/attachments`,
      {
        method: 'POST',
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to upload attachment');
    }

    return await response.json();
  } catch (error) {
    console.error('Error uploading skill attachment:', error);
    throw error;
  }
}

export async function getAttachmentContent(
  skillId: string,
  filename: string,
): Promise<{ content: string; filename: string }> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const response = await fetch(
      `${API_URL}/accounts/${accountId}/skills/${skillId}/attachments/${encodeURIComponent(filename)}/content`,
      {
        headers: await getAuthHeaders(),
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch attachment content');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching attachment content:', error);
    throw error;
  }
}

export async function removeSkillAttachment(skillId: string, filename: string) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const response = await fetch(
      `${API_URL}/accounts/${accountId}/skills/${skillId}/attachments/${encodeURIComponent(filename)}`,
      {
        method: 'DELETE',
        headers: await getAuthHeaders(),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to remove attachment');
    }

    return await response.json();
  } catch (error) {
    console.error('Error removing skill attachment:', error);
    throw error;
  }
}
