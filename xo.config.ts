import {type FlatXoConfig} from 'xo';

const xoConfig: FlatXoConfig = [
	{
		rules: {
			'capitalized-comments': 'off', // 주석 첫글자 대문자화 방지
			'unicorn/filename-case': 'off', // 파일 이름 camelcase 강제 방지
			'@typescript-eslint/naming-convention': 'off', // React등 파일 이름에 camel case 이외의 이름 허용
			'@typescript-eslint/no-restricted-types': 'off', // Jsx에 대한 undefined 대신 null입력 허용
			'no-bitwise': 'off', // 비트 연산자 사용 허용
		},
		prettier: true,
	},
];

export default xoConfig;
