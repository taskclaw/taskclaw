'use server';

import { cookies } from 'next/headers';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

async function getAuthHeaders() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

async function getCurrentAccountId(): Promise<string | null> {
  const cookieStore = await cookies();
  const accountId = cookieStore.get('current_account_id')?.value;
  return accountId || null;
}

export async function getKnowledgeDocs(categoryId?: string) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const url = categoryId
      ? `${API_URL}/accounts/${accountId}/knowledge?category_id=${categoryId}`
      : `${API_URL}/accounts/${accountId}/knowledge`;

    const response = await fetch(url, {
      headers: await getAuthHeaders(),
      cache: 'no-store',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch knowledge docs');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching knowledge docs:', error);
    throw error;
  }
}

export async function getKnowledgeDoc(id: string) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const response = await fetch(`${API_URL}/accounts/${accountId}/knowledge/${id}`, {
      headers: await getAuthHeaders(),
      cache: 'no-store',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch knowledge doc');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching knowledge doc:', error);
    throw error;
  }
}

export async function createKnowledgeDoc(data: {
  title: string;
  content: string;
  category_id?: string;
  is_master?: boolean;
}) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const response = await fetch(`${API_URL}/accounts/${accountId}/knowledge`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create knowledge doc');
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating knowledge doc:', error);
    throw error;
  }
}

export async function updateKnowledgeDoc(
  id: string,
  data: {
    title?: string;
    content?: string;
    category_id?: string;
    is_master?: boolean;
  },
) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const response = await fetch(`${API_URL}/accounts/${accountId}/knowledge/${id}`, {
      method: 'PATCH',
      headers: await getAuthHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update knowledge doc');
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating knowledge doc:', error);
    throw error;
  }
}

export async function setAsMasterDoc(id: string) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const response = await fetch(`${API_URL}/accounts/${accountId}/knowledge/${id}/set-master`, {
      method: 'POST',
      headers: await getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to set as master doc');
    }

    return await response.json();
  } catch (error) {
    console.error('Error setting master doc:', error);
    throw error;
  }
}

export async function deleteKnowledgeDoc(id: string) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const response = await fetch(`${API_URL}/accounts/${accountId}/knowledge/${id}`, {
      method: 'DELETE',
      headers: await getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete knowledge doc');
    }

    return await response.json();
  } catch (error) {
    console.error('Error deleting knowledge doc:', error);
    throw error;
  }
}

export async function getCategories() {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const response = await fetch(`${API_URL}/accounts/${accountId}/categories`, {
      headers: await getAuthHeaders(),
      cache: 'no-store',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch categories');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching categories:', error);
    throw error;
  }
}

export async function getAttachmentContent(
  docId: string,
  filename: string,
): Promise<{ content: string; filename: string }> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const response = await fetch(
      `${API_URL}/accounts/${accountId}/knowledge/${docId}/attachments/${encodeURIComponent(filename)}/content`,
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

export async function uploadAttachment(docId: string, formData: FormData) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    const response = await fetch(
      `${API_URL}/accounts/${accountId}/knowledge/${docId}/attachments`,
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
    console.error('Error uploading attachment:', error);
    throw error;
  }
}

export async function removeAttachment(docId: string, filename: string) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const response = await fetch(
      `${API_URL}/accounts/${accountId}/knowledge/${docId}/attachments/${encodeURIComponent(filename)}`,
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
    console.error('Error removing attachment:', error);
    throw error;
  }
}
