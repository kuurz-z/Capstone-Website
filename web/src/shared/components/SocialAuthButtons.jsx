import React from "react";

/**
 * Google and Facebook social auth buttons with branded SVG icons.
 * Eliminates ~40 lines of identical SVG+button markup from both SignUp and SignIn.
 */
const SocialAuthButtons = ({
  onGoogle,
  onFacebook,
  loading,
  dividerText = "Or continue with",
}) => (
  <>
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-gray-200"></div>
      </div>
      <div className="relative flex justify-center text-sm">
        <span className="px-4 bg-white text-gray-500 font-light">
          {dividerText}
        </span>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-4">
      <button
        type="button"
        className="flex items-center justify-center gap-3 px-4 py-4 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
        onClick={onGoogle}
        disabled={loading}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="#EA4335"
            d="M5.26620003,9.76452941 C6.19878754,6.93863203 8.85444915,4.90909091 12,4.90909091 C13.6909091,4.90909091 15.2181818,5.50909091 16.4181818,6.49090909 L19.9090909,3 C17.7818182,1.14545455 15.0545455,0 12,0 C7.27006974,0 3.1977497,2.69829785 1.23999023,6.65002441 L5.26620003,9.76452941 Z"
          />
          <path
            fill="#34A853"
            d="M16.0407269,18.0125889 C14.9509167,18.7163016 13.5660892,19.0909091 12,19.0909091 C8.86648613,19.0909091 6.21911939,17.076871 5.27698177,14.2678769 L1.23746264,17.3349879 C3.19279051,21.2936293 7.26500293,24 12,24 C14.9328362,24 17.7353462,22.9573905 19.834192,20.9995801 L16.0407269,18.0125889 Z"
          />
          <path
            fill="#4A90E2"
            d="M19.834192,20.9995801 C22.0291676,18.9520994 23.4545455,15.903663 23.4545455,12 C23.4545455,11.2909091 23.3454545,10.5272727 23.1818182,9.81818182 L12,9.81818182 L12,14.4545455 L18.4363636,14.4545455 C18.1187732,16.013626 17.2662994,17.2212117 16.0407269,18.0125889 L19.834192,20.9995801 Z"
          />
          <path
            fill="#FBBC05"
            d="M5.27698177,14.2678769 C5.03832634,13.556323 4.90909091,12.7937589 4.90909091,12 C4.90909091,11.2182781 5.03443647,10.4668121 5.26620003,9.76452941 L1.23999023,6.65002441 C0.43658717,8.26043162 0,10.0753848 0,12 C0,13.9195484 0.444780743,15.7301709 1.23746264,17.3349879 L5.27698177,14.2678769 Z"
          />
        </svg>
        <span className="text-gray-700 font-light text-sm">Google</span>
      </button>
      <button
        type="button"
        className="flex items-center justify-center gap-3 px-4 py-4 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
        onClick={onFacebook}
        disabled={loading}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#1877F2">
          <path d="M20 12.06C20 6.54 15.52 2.06 10 2.06S0 6.54 0 12.06C0 17.05 3.66 21.19 8.44 21.94V14.95H5.9V12.06H8.44V9.86C8.44 7.35 9.93 5.97 12.22 5.97C13.31 5.97 14.45 6.16 14.45 6.16V8.62H13.19C11.95 8.62 11.56 9.39 11.56 10.18V12.06H14.34L13.9 14.95H11.56V21.94C16.34 21.19 20 17.05 20 12.06Z" />
        </svg>
        <span className="text-gray-700 font-light text-sm">Facebook</span>
      </button>
    </div>
  </>
);

export default SocialAuthButtons;
