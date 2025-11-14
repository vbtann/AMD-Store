import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Swal from 'sweetalert2';
import { authClient } from '../../lib/auth-client';
import { formatDate } from '../../services/api';
import LoadingSpinner from '../../components/LoadingSpinner';
import RandomPasswordButton from '../../components/RandomPasswordButton';
import { generateSimplePassword } from '../../utils/passwordGenerator';

const SellersManagement = () => {
	const [sellers, setSellers] = useState([]);
	const [loading, setLoading] = useState(true);
	const [showModal, setShowModal] = useState(false);
	const [editingSeller, setEditingSeller] = useState(null);
	const [formData, setFormData] = useState({
		username: '',
		password: '',
		email: '',
		name: '',
		role: 'seller'
	});

	// Fetch sellers
	useEffect(() => {
		fetchSellers();
	}, []);

	const fetchSellers = async () => {
		try {
			setLoading(true);
			const { data, error } = await authClient.admin.listUsers({
				query: {
					filterField: 'role',
					filterValue: 'seller',
					filterOperator: 'eq'
				}
			});

			if (error) {
				throw new Error(error.message);
			}

			setSellers(data.users || []);
		} catch (error) {
			console.error('Error fetching sellers:', error);
			toast.error('Lỗi khi tải danh sách seller');
		} finally {
			setLoading(false);
		}
	};

	const handlePasswordGenerated = (newPassword) => {
		setFormData(prev => ({
			...prev,
			password: newPassword
		}));
	};

	const handleResetPassword = async (sellerId, sellerName) => {
		const result = await Swal.fire({
			title: 'Reset mật khẩu seller',
			text: `Bạn muốn reset mật khẩu cho seller "${sellerName}"?`,
			html: `
				<div class="text-left">
					<p class="mb-4">Bạn muốn reset mật khẩu cho seller "<strong>${sellerName}</strong>"?</p>
					<div class="mb-4">
						<label for="new-password" class="block text-sm font-medium text-gray-700 mb-2">Mật khẩu mới:</label>
						<div class="flex space-x-2">
							<input 
								type="password" 
								id="new-password" 
								class="swal2-input flex-1" 
								placeholder="Nhập mật khẩu mới..." 
								style="margin: 0; flex: 1;"
							/>
							<button 
								type="button" 
								id="generate-btn" 
								class="swal2-confirm swal2-styled" 
								style="margin: 0; padding: 8px 12px; font-size: 14px; background-color: #3b82f6;"
								title="Tạo mật khẩu ngẫu nhiên"
							>
								<i class="fas fa-random"></i>
							</button>
						</div>
						<small class="text-gray-500 mt-1 block">Mật khẩu phải có ít nhất 6 ký tự</small>
					</div>
				</div>
			`,
			showCancelButton: true,
			confirmButtonColor: '#3b82f6',
			cancelButtonColor: '#6b7280',
			confirmButtonText: 'Reset mật khẩu',
			cancelButtonText: 'Hủy',
			didOpen: () => {
				const generateBtn = document.getElementById('generate-btn');
				const passwordInput = document.getElementById('new-password');

				generateBtn.addEventListener('click', () => {
					const randomPassword = generateSimplePassword(10);
					passwordInput.value = randomPassword;
					passwordInput.type = 'text'; // Temporarily show the generated password
					setTimeout(() => {
						passwordInput.type = 'password';
					}, 2000); // Hide after 2 seconds
				});
			},
			preConfirm: () => {
				const password = document.getElementById('new-password').value;
				if (!password) {
					Swal.showValidationMessage('Vui lòng nhập mật khẩu mới!');
					return false;
				}
				if (password.length < 6) {
					Swal.showValidationMessage('Mật khẩu phải có ít nhất 6 ký tự!');
					return false;
				}
				return password;
			}
		});

		if (result.isConfirmed && result.value) {
			try {
				// Use Better-Auth admin setUserPassword instead of deprecated API
				const { error } = await authClient.admin.setUserPassword({
					userId: sellerId,
					newPassword: result.value
				});

				if (error) {
					throw new Error(error.message);
				}

				toast.success('Reset mật khẩu seller thành công');
			} catch (error) {
				console.error('Error resetting seller password:', error);
				toast.error(error.message || 'Lỗi khi reset mật khẩu seller');
			}
		}
	};

	const handleInputChange = (e) => {
		const { name, value } = e.target;
		setFormData(prev => ({
			...prev,
			[name]: value
		}));
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		try {
			if (editingSeller) {
				// Update seller using better-auth admin functions
				if (formData.password) {
					await authClient.admin.setUserPassword({
						userId: editingSeller.id,
						newPassword: formData.password
					});
				}

				// Update other fields using updateUser
				const { error } = await authClient.updateUser({
					name: formData.name,
					username: formData.username
				});

				if (error) {
					throw new Error(error.message);
				}

				toast.success('Cập nhật seller thành công');
			} else {
				// Create new seller
				const { error } = await authClient.admin.createUser({
					email: formData.email,
					password: formData.password,
					name: formData.name,
					role: 'seller',
					data: {
						username: formData.username
					}
				});

				if (error) {
					throw new Error(error.message);
				}

				toast.success('Thêm seller thành công');
			}

			setShowModal(false);
			setEditingSeller(null);
			setFormData({
				username: '',
				password: '',
				email: '',
				name: '',
				role: 'seller'
			});
			fetchSellers();
		} catch (error) {
			console.error('Error saving seller:', error);
			toast.error(error.message || 'Lỗi khi lưu seller');
		}
	};

	const handleEdit = (seller) => {
		setEditingSeller(seller);
		setFormData({
			username: seller.username || '',
			password: '', // Don't populate password for security
			email: seller.email || '',
			name: seller.name || '',
			role: 'seller'
		});
		setShowModal(true);
	};

	const handleDelete = async (sellerId) => {
		const result = await Swal.fire({
			title: 'Xác nhận xóa seller',
			text: 'Bạn có chắc chắn muốn xóa seller này? Hành động này không thể hoàn tác.',
			icon: 'warning',
			showCancelButton: true,
			confirmButtonColor: '#dc2626',
			cancelButtonColor: '#6b7280',
			confirmButtonText: 'Xóa',
			cancelButtonText: 'Hủy'
		});

		if (result.isConfirmed) {
			try {
				const { error } = await authClient.admin.removeUser({
					userId: sellerId
				});

				if (error) {
					throw new Error(error.message);
				}

				toast.success('Xóa seller thành công');
				fetchSellers();
			} catch (error) {
				console.error('Error deleting seller:', error);
				toast.error('Lỗi khi xóa seller');
			}
		}
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-64">
				<LoadingSpinner size="large" text="Đang tải danh sách seller..." />
			</div>
		);
	}

	return (
		<div className="p-6">
			{/* Header */}
			<div className="flex justify-between items-center mb-6">
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Quản lý Seller</h1>
					<p className="text-gray-600">Thêm, sửa, xóa và quản lý tài khoản seller</p>
				</div>
				<button
					onClick={() => {
						setEditingSeller(null);
						setFormData({
							username: '',
							password: '',
							email: '',
							fullName: '',
							isActive: true
						});
						setShowModal(true);
					}}
					className="btn-primary"
				>
					<i className="fas fa-plus mr-2"></i>
					Thêm seller mới
				</button>
			</div>

			{/* Sellers Table */}
			<div className="card">
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-gray-200">
						<thead className="bg-gray-50">
							<tr>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Thông tin seller
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Username
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Email
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Trạng thái
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Ngày tạo
								</th>
								<th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
									Hành động
								</th>
							</tr>
						</thead>
						<tbody className="bg-white divide-y divide-gray-200">
							{sellers.map((seller) => (
								<tr key={seller.id} className="hover:bg-gray-50">
									<td className="px-6 py-4">
										<div>
											<div className="text-sm font-medium text-gray-900">
												{seller.name || 'Chưa cập nhật'}
											</div>
											<div className="text-sm text-gray-500">
												ID: {seller.id.slice(-8)}
											</div>
										</div>
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
										{seller.username}
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
										{seller.email || 'Chưa cập nhật'}
									</td>
									<td className="px-6 py-4 whitespace-nowrap">
										<span className="badge badge-success">
											Hoạt động
										</span>
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
										{formatDate(seller.createdAt)}
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
										<button
											onClick={() => handleEdit(seller)}
											className="text-primary-600 hover:text-primary-900 mr-3"
										>
											<i className="fas fa-edit mr-1"></i>
											Sửa
										</button>
										<button
											onClick={() => handleResetPassword(seller.id, seller.name || seller.username)}
											className="text-yellow-600 hover:text-yellow-900 mr-3"
										>
											<i className="fas fa-key mr-1"></i>
											Reset MK
										</button>
										<button
											onClick={() => handleDelete(seller.id)}
											className="text-danger-600 hover:text-danger-900"
										>
											<i className="fas fa-trash mr-1"></i>
											Xóa
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>

					{sellers.length === 0 && (
						<div className="text-center py-12">
							<i className="fas fa-users text-6xl text-gray-300 mb-4"></i>
							<h3 className="text-lg font-semibold text-gray-900 mb-2">Chưa có seller</h3>
							<p className="text-gray-600">Thêm seller đầu tiên để bắt đầu</p>
						</div>
					)}
				</div>
			</div>

			{/* Modal */}
			{showModal && (
				<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
					<div className="bg-white rounded-lg max-w-md w-full">
						<div className="p-6">
							<div className="flex justify-between items-center mb-6">
								<h2 className="text-xl font-semibold text-gray-900">
									{editingSeller ? 'Chỉnh sửa seller' : 'Thêm seller mới'}
								</h2>
								<button
									onClick={() => setShowModal(false)}
									className="text-gray-500 hover:text-gray-700"
								>
									<i className="fas fa-times text-xl"></i>
								</button>
							</div>

							<form onSubmit={handleSubmit} className="space-y-4">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Username *
									</label>
									<input
										type="text"
										name="username"
										value={formData.username}
										onChange={handleInputChange}
										className="form-input"
										required
										minLength="3"
										maxLength="30"
									/>
								</div>

								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										{editingSeller ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu *'}
									</label>
									<div className="flex space-x-2">
										<input
											type="password"
											name="password"
											value={formData.password}
											onChange={handleInputChange}
											className="form-input flex-1"
											required={!editingSeller}
											minLength="6"
										/>
										{!editingSeller && (
											<RandomPasswordButton
												onPasswordGenerated={handlePasswordGenerated}
												length={10}
												title="Tạo mật khẩu ngẫu nhiên"
											/>
										)}
									</div>
								</div>

								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Họ tên *
									</label>
									<input
										type="text"
										name="name"
										value={formData.name}
										onChange={handleInputChange}
										className="form-input"
										required
									/>
								</div>

								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Email *
									</label>
									<input
										type="email"
										name="email"
										value={formData.email}
										onChange={handleInputChange}
										className="form-input"
										required
									/>
								</div>

								<div className="flex justify-end space-x-3 pt-4">
									<button
										type="button"
										onClick={() => setShowModal(false)}
										className="btn-secondary"
									>
										Hủy
									</button>
									<button type="submit" className="btn-primary">
										{editingSeller ? 'Cập nhật' : 'Thêm mới'}
									</button>
								</div>
							</form>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default SellersManagement;
